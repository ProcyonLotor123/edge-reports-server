import { asArray, asNumber, asObject, asString } from 'cleaners'
import fetch from 'node-fetch'

import { PartnerPlugin, PluginParams, PluginResult, StandardTx } from '../types'

const QUERY_LOOKBACK = 1000 * 60 * 60 * 24 * 30 // 30 days

export async function queryBitsOfGold(
  pluginParams: PluginParams
): Promise<PluginResult> {
  const ssFormatTxs: StandardTx[] = []
  let apiKey = ''
  if (typeof pluginParams.apiKeys.apiKey === 'string') {
    apiKey = pluginParams.apiKeys.apiKey
  } else {
    return {
      settings: { previousSearchedDate: pluginParams.settings.previousSearchedDate ? pluginParams.settings.previousSearchedDate : new Date('2019-01-01') },
      transactions: []
    }
  }

  let previousDate = pluginParams.settings.previousSearchedDate ? pluginParams.settings.previousSearchedDate : new Date('2019-01-01')
  let millisecondPreviousSearchedDate = new Date(previousDate).getTime() - QUERY_LOOKBACK 
  let startDate = new Date(millisecondPreviousSearchedDate)
  let endDate = new Date(Date.now())
  let formattedStartDate = `${startDate.getDate()}-${startDate.getMonth() + 1}-${startDate.getFullYear()}`
  let formattedEndDate = `${endDate.getDate()}-${endDate.getMonth() + 1}-${endDate.getFullYear()}`
  let url = `http://webapi.bitsofgold.co.il/v1/sells/by_provider/?provider=${pluginParams.apiKeys.apiKey}&filter%5Bcreated_at_gteq%5D=%27${formattedStartDate}%27&filter%5Bcreated_at_lt%5D=%27${formattedEndDate}`
  const headers = {
    'x-api-key': apiKey
  }

  let resultJSON
  try {
    const result = await fetch(url, { method: 'GET', headers: headers })
    resultJSON = await result.json()
  } catch (e) {
    console.log(e)
  }
  const txs = resultJSON.data
  let latestTimeStamp = startDate.getTime()
  for (const tx of txs) {
    const data = tx.attributes
    const date = new Date(data.timestamp)
    const timestamp = date.getTime() 

    const ssTx: StandardTx = {
      status: 'complete',
      inputTXID: tx.id,
      inputAddress: '',
      inputCurrency: data.coin_type,
      inputAmount: data.coin_amount,
      outputAddress: '',
      outputCurrency: data.fiat_type,
      outputAmount: data.fiat_amount,
      timestamp,
      isoDate: data.timestamp
    }
    latestTimeStamp = latestTimeStamp > timestamp ? latestTimeStamp : timestamp
    ssFormatTxs.push(ssTx)
  }

  return {
    settings: { previousSearchedDate: new Date(latestTimeStamp) },
    transactions: ssFormatTxs
  }
}

export const bitsofgold: PartnerPlugin = {
  // queryFunc will take PluginSettings as arg and return PluginResult
  queryFunc: queryBitsOfGold,
  // results in a PluginResult
  pluginName: 'BitsOfGold',
  pluginId: 'bitsofgold'
}