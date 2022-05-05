import axios from 'axios'
import nullthrows from 'nullthrows'
import { StaticJsonRpcProvider } from '@ethersproject/providers'

// const INFURA_PROJECT_ID = nullthrows(process.env.INFURA_PROJECT_ID)
const SUBGRAPH_ID = nullthrows(process.env.SUBGRAPH_ID)

export async function main() {
  // with infura ID
  // `https://optimism-mainnet.infura.io/v3/${INFURA_PROJECT_ID}`
  const rpcUrl = 'https://mainnet.optimism.io'
  const provider = new StaticJsonRpcProvider(rpcUrl, 10)
  // TODO: fetch latest block from subgraph
  const block = await provider.getBlock('latest')
  const result = await axios({
    url: `https://api.thegraph.com/subgraphs/id/${SUBGRAPH_ID}`,
    method: 'post',
    data: {
      query: `{
      markets(block:{number:${block.number}}) {
        name
        rounds(where: {isActive: true}) {
          expiries {
            expiry
            strikes {
              putOption {
                price
              }
              callOption {
                price
              }
            }
          }
        }
      }
    }`,
    },
  })
  console.log(result.data)
  console.log(JSON.stringify(result.data.data, null, 2))
}
