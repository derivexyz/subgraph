import fs from 'fs'
import axios from 'axios'
import * as ethers from 'ethers'

function buildQuery(marketAddr: string, orderBy: unknown) {
  return `{
    market (id:"${marketAddr}") {
      id
      board {
        id
        expiry
        listings {
          id
          strike
          snapshotsCount
          snapshots(order:${orderBy}) {
            vol
            spotPrice
            timestamp
          }
        }
      }
    }
  }`
}

async function main() {
  const addresses = require('../addresses/addresses.json')
  const data: any = {}
  for (const ticker of ['sETH', 'sBTC', 'sAAVE', 'sUNI', 'sLINK']) {
    data[ticker] = {}
    console.log(`Market ${ticker}`)
    const marketAddr = addresses.markets[ticker].OptionMarket.toLowerCase()
    const result = await axios({
      url: 'https://api.studio.thegraph.com/query/1452/lyra/v0.0.19',
      method: 'post',
      data: {
        query: buildQuery(marketAddr, { asc: 'timestamp' }),
      },
    })

    if (result.data.error) {
      console.log('ERROR')
      console.log(result.data.error)
    } else {
      console.log('SUCCESS')
      let listingResults: any = {}
      for (const board of result.data.data.market.board as any[]) {
        const boardId = `${board.expiry.toString()}-${board.id.split('-')[1]}`
        listingResults[boardId] = {}
        for (const listing of board.listings) {
          const listingId = `${ethers.utils.formatEther(listing.strike)}-${listing.id.split('-')[1]}`
          listingResults[boardId][listingId] = (listing as any).snapshots.map((x: any) => {
            return {
              vol: ethers.utils.formatEther(ethers.BigNumber.from(x.vol).mul(-1).div(ethers.BigNumber.from(10).pow(9))),
              spotPrice: ethers.utils.formatEther(x.spotPrice),
              timestamp: parseFloat(x.timestamp),
            }
          })
        }

        data[ticker] = listingResults
      }
    }
  }
  fs.writeFileSync(
    `${__dirname}/results/data.ts`,
    'export const data: {[key: string]: {[key: string]: {[key:string]: {vol: string, spotPrice: string, timestamp: number}[]}}} = ' +
      JSON.stringify(data, undefined, 2),
  )
}

main().then(() => console.log('Done.'))
