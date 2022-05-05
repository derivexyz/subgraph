import axios from 'axios'
import nullthrows from 'nullthrows'
import fs from 'fs'
import path from 'path'

// const INFURA_PROJECT_ID = nullthrows(process.env.INFURA_PROJECT_ID)
const SUBGRAPH_ID = nullthrows(process.env.SUBGRAPH_ID)

// snapshot the following entities: Global, Market, Round, Expiry, Strike, Option, Trader, TraderRound
export async function main() {
  const result = await axios({
    url: 'https://api.thegraph.com/index-node/graphql',
    method: 'post',
    data: {
      query: `{
        indexingStatuses(subgraphs: ["${SUBGRAPH_ID}"]) {
          chains {
            latestBlock {
              number
            }
          }
        }
      }`,
    },
  })
  const latestBlockNumber = nullthrows(result.data.data.indexingStatuses[0]?.chains[0]?.latestBlock?.number)
  console.log(`Snapshotting latest block: ${latestBlockNumber}`)
  const baseDir = path.join(__dirname, '../snapshots', `${SUBGRAPH_ID}-${latestBlockNumber}`)
  if (fs.existsSync(baseDir)) {
    fs.rmSync(baseDir, { recursive: true })
  }
  fs.mkdirSync(baseDir)

  // Global
  const globalsResult = await axios({
    url: `https://api.thegraph.com/subgraphs/id/${SUBGRAPH_ID}`,
    method: 'post',
    data: {
      query: `{
        globals(block:{number:${latestBlockNumber}}) {
          id
          address
          synthetix
          exchanger
          exchangeRates
          collateralShort
          isPaused
        }
      }`,
    },
  })
  const globals = nullthrows(globalsResult.data.data.globals)
  fs.writeFileSync(path.join(baseDir, 'Global.json'), JSON.stringify(globals, null, 2))
  console.log(`Global: ${globals.length} entities`)

  // Market
  const marketsResult = await axios({
    url: `https://api.thegraph.com/subgraphs/id/${SUBGRAPH_ID}`,
    method: 'post',
    data: {
      query: `{
        markets(block:{number:${latestBlockNumber}}) {
          id
          address
          name
          quoteAddress
          quoteKey
          baseAddress
          baseKey
          owner
          currentRoundNumber
          isRemoved
          tradingCutoff
          optionPriceFeeCoefficient
          spotPriceFeeCoefficient
          vegaFeeCoefficient
          standardSize
          minDelta
          rateAndCarry
          pool {
            id
          }
        }
      }`,
    },
  })
  const markets = nullthrows(marketsResult.data.data.markets)
  fs.writeFileSync(path.join(baseDir, 'Market.json'), JSON.stringify(markets, null, 2))
  console.log(`Market: ${markets.length} entities`)

  // Round
  const roundsResult = await axios({
    url: `https://api.thegraph.com/subgraphs/id/${SUBGRAPH_ID}`,
    method: 'post',
    data: {
      query: `{
        rounds(block:{number:${latestBlockNumber}}) {
          id
          number
          market {
            id
          }
          isActive
          startTimestamp
          endTimestamp
          totalLongFee
          totalShortFee
          shortPutCollateralCounter
          shortCallCollateralCounter
        }
      }`,
    },
  })
  const rounds = nullthrows(roundsResult.data.data.rounds)
  fs.writeFileSync(path.join(baseDir, 'Round.json'), JSON.stringify(rounds, null, 2))
  console.log(`Round: ${rounds.length} entities`)

  // Expiry
  const expiriesResult = await axios({
    url: `https://api.thegraph.com/subgraphs/id/${SUBGRAPH_ID}`,
    method: 'post',
    data: {
      query: `{
        expiries(block:{number:${latestBlockNumber}}) {
          id
          boardId
          expiry
          baseIv
          iv
          market {
            id
          }
          round {
            id
          }
        }
      }`,
    },
  })
  const expiries = nullthrows(expiriesResult.data.data.expiries)
  fs.writeFileSync(path.join(baseDir, 'Expiry.json'), JSON.stringify(expiries, null, 2))
  console.log(`Expiry: ${expiries.length} entities`)

  // Strike
  const strikesResult = await axios({
    url: `https://api.thegraph.com/subgraphs/id/${SUBGRAPH_ID}`,
    method: 'post',
    data: {
      query: `{
        strikes(block:{number:${latestBlockNumber}}) {
          id
          listingId
          strike
          skew
          vol
          market {
            id
          }
          round {
            id
          }
          expiry {
            id
          }
          callOption {
            id
          }
          putOption {
            id
          }
        }
      }`,
    },
  })
  const strikes = nullthrows(strikesResult.data.data.strikes)
  fs.writeFileSync(path.join(baseDir, 'Strike.json'), JSON.stringify(strikes, null, 2))
  console.log(`Strike: ${strikes.length} entities`)

  // Strike
  const optionsResult = await axios({
    url: `https://api.thegraph.com/subgraphs/id/${SUBGRAPH_ID}`,
    method: 'post',
    data: {
      query: `{
        options(block:{number:${latestBlockNumber}}) {
          id
          isCall
          price
          openInterest
          openInterestValue
          market {
            id
          }
          round {
            id
          }
          expiry {
            id
          }
          strike {
            id
          }
        }
      }`,
    },
  })
  const options = nullthrows(optionsResult.data.data.options)
  fs.writeFileSync(path.join(baseDir, 'Option.json'), JSON.stringify(options, null, 2))
  console.log(`Option: ${strikes.length} entities`)

  // Trader
  const tradersResult = await axios({
    url: `https://api.thegraph.com/subgraphs/id/${SUBGRAPH_ID}`,
    method: 'post',
    data: {
      query: `{
        traders(block:{number:${latestBlockNumber}}) {
          id
        }
      }`,
    },
  })
  const traders = nullthrows(tradersResult.data.data.traders)
  fs.writeFileSync(path.join(baseDir, 'Trader.json'), JSON.stringify(traders, null, 2))
  console.log(`Trader: ${traders.length} entities`)

  // TraderRound
  const traderRoundsResult = await axios({
    url: `https://api.thegraph.com/subgraphs/id/${SUBGRAPH_ID}`,
    method: 'post',
    data: {
      query: `{
        traderRounds(block:{number:${latestBlockNumber}}) {
          id
          trader {
            id
          }
          round {
            id
          }
          firstSeen
          totalLongFee
          totalShortFee
          shortPutCollateralCounter
          shortCallCollateralCounter
        }
      }`,
    },
  })
  const traderRounds = nullthrows(traderRoundsResult.data.data.traderRounds)
  fs.writeFileSync(path.join(baseDir, 'TraderRound.json'), JSON.stringify(traderRounds, null, 2))
  console.log(`Trader: ${traderRounds.length} entities`)
}
