import axios from 'axios'

axios({
  url: 'https://api.studio.thegraph.com/query/1452/lyra/v0.0.19',
  method: 'post',
  data: {
    query: `{
      markets(first: 5) {
        id
        board {
          id
          listings {
            id
          }
        }
      }
    }`,
  },
}).then((result) => {
  console.log(result.data)
  console.log(JSON.stringify(result.data.data, null, 2))
})
