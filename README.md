# Lyra Subgraph

Example Queries can be found in ExampleQueries.md

## To run and deploy

list of networks: `local`, `local-ovm`, `kovan-ovm`, `mainnet-ovm`
list of deployTypes: `real`, `realPricing`, `mockSnx`

```bash
$ yarn build <network> <deployType>
$ yarn deploy <network> <deployType>
```

## Instructions for local

1 - Clone `Lyra - Smart contracts` repository adjacently to this repo, and install dependencies

```bash
$ git clone git@github.com:lyra-finance/lyra.git

$ yarn install
```

2 - Clone the `Optimism` repository adjacently to this repo, and install dependencies

```bash
$ git clone https://github.com/ethereum-optimism/optimism.git
$ cd optimism/ops
```

3 - Launch an optimism node

```bash
$ docker-compose -f docker-compose-nobuild.yml up -t 3600
```

4 - Deploy the Lyra contracts to the local optimism network (From the Lyra directory)

```bash
$ yarn deployTest --network local
$ yarn seedTest --network local
```

5 - Sync deployment files (From subgraph directory)

```bash
$ yarn sync-local
```

6 - Start the subgraph

```bash
$ yarn graph-node
```

7 - Create and deploy the graph

```bash
$ yarn create-local
$ yarn deploy-local
```

## You can use the following tool to query for subgraph error messages: 
https://graphiql-online.com/graphiql

```graphql
query MyQuery {
  indexingStatuses(subgraphs: ["{subgraph ID}"]) {
    fatalError {
      message
      block {
        number
      }
    }
    nonFatalErrors {
      message
      block {
        number
      }
    }
  }
}

```