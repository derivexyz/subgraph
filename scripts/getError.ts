import axios from 'axios'

axios({
  url: 'https://api.thegraph.com/index-node/graphql',
  method: 'post',
  data: {
    query: `{
  indexingStatusForCurrentVersion(subgraphId: "QmRWM4pVmWrFDgMgjqc5QKGQUc4H6gSGAoVy566N7i8s87") {
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
