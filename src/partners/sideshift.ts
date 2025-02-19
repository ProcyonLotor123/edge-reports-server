import { asArray, asMaybe, asObject, asString, asUnknown } from 'cleaners'
import crypto from 'crypto'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'
import { datelog } from '../util'

const asSideshiftTx = asObject({
  id: asString,
  depositAddress: asMaybe(asObject({ address: asMaybe(asString) })),
  prevDepositAddresses: asMaybe(asObject({ address: asMaybe(asString) })),
  depositMethodId: asString,
  invoiceAmount: asString,
  settleAddress: asObject({
    address: asString
  }),
  settleMethodId: asString,
  settleAmount: asString,
  createdAt: asString
})

type SideshiftTx = ReturnType<typeof asSideshiftTx>
const asSideshiftResult = asArray(asUnknown)

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 5 // 5 days

function affiliateSignature(
  affiliateId: string,
  affiliateSecret: string,
  time: number
): string {
  return crypto
    .createHmac('sha1', affiliateSecret)
    .update(`${affiliateId}${time}`)
    .digest('hex')
}

async function fetchTransactions(
  affiliateId: string,
  affiliateSecret: string,
  lastCheckedTimestamp: number
): Promise<StandardTx[]> {
  const time = Date.now()

  const signature = affiliateSignature(affiliateId, affiliateSecret, time)
  const url = `https://sideshift.ai/api/affiliate/completedOrders?affiliateId=${affiliateId}&since=${lastCheckedTimestamp}&currentTime=${time}&signature=${signature}`

  try {
    const response = await fetch(url)
    const jsonObj = await response.json()
    const orders = asSideshiftResult(jsonObj)

    return orders.map(order => {
      let tx: SideshiftTx
      try {
        tx = asSideshiftTx(order)
      } catch (e) {
        datelog(e)
        datelog(JSON.stringify(order, null, 2))
        throw e
      }
      const depositAddress =
        tx.depositAddress?.address ?? tx.prevDepositAddresses?.address

      return {
        status: 'complete',
        orderId: tx.id,
        depositTxid: undefined,
        depositAddress,
        depositCurrency: tx.depositMethodId.toUpperCase(),
        depositAmount: Number(tx.invoiceAmount),
        payoutTxid: undefined,
        payoutAddress: tx.settleAddress.address,
        payoutCurrency: tx.settleMethodId.toUpperCase(),
        payoutAmount: Number(tx.settleAmount),
        timestamp: new Date(tx.createdAt).getTime() / 1000,
        isoDate: tx.createdAt,
        usdValue: undefined,
        rawTx: order
      }
    })
  } catch (e) {
    datelog(e)
    throw e
  }
}

export async function querySideshift(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const {
    apiKeys: { sideshiftAffiliateId, sideshiftAffiliateSecret }
  } = pluginParams
  let {
    settings: { lastCheckedTimestamp = 0 }
  } = pluginParams

  if (
    typeof lastCheckedTimestamp === 'number' &&
    lastCheckedTimestamp > QUERY_LOOKBACK
  ) {
    lastCheckedTimestamp -= QUERY_LOOKBACK
  }

  if (
    !(typeof sideshiftAffiliateSecret === 'string') ||
    !(typeof sideshiftAffiliateId === 'string')
  ) {
    return {
      settings: { lastCheckedTimestamp },
      transactions: []
    }
  }

  const txs: StandardTx[] = []

  const newTxs = await fetchTransactions(
    sideshiftAffiliateId,
    sideshiftAffiliateSecret,
    lastCheckedTimestamp
  )

  txs.push(...newTxs)

  return {
    settings: {
      lastCheckedTimestamp: Math.max(...newTxs.map(tx => tx.timestamp)) * 1000
    },
    transactions: txs
  }
}

export const sideshift: PartnerPlugin = {
  queryFunc: querySideshift,
  pluginName: 'SideShift.ai',
  pluginId: 'sideshift'
}
