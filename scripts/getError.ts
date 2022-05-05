import axios from 'axios'

axios({
  url: 'https://api.thegraph.com/index-node/graphql',
  method: 'post',
  data: {
    query: `{
  indexingStatusForCurrentVersion(subgraphId: "QmRLoncAgBNhgTdTCVCkwrgvWcUbx2nCWkRetWbfeyRyrY") {
    synced
    health
    fatalError {
      message
      block {
        number
        hash
      }
      handler
    }
    chains {
      chainHeadBlock {
        number
      }
      latestBlock {
        number
      }
    }
  }
}`,
  },
}).then((result) => {
  console.log(result.data)
  console.log(JSON.stringify(result.data.data, null, 2))
})
