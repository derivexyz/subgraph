# Lyra Subgraph

## To run and deploy

list of networks: `local`, `local-ovm`, `kovan-ovm`, `mainnet-ovm`
list of deployTypes: `real`, `realPricing`, `mockSnx`

```bash
$ yarn import-contracts
$ yarn build <network> <deployType>
$ yarn deploy <subgraph-url> <accessToken> <network> <deployType>
```

## To run and deploy a local environment for optimism subgraph

1 - Console #1: Clone `Lyra - Smart contracts` repository adjacently to this repo, and install dependencies

```bash
$ git clone git@github.com:lyra-finance/lyra.git

$ yarn install
```

2- Console #2: In a separate directory/window, launch a local chain.

```bash
$ npx hardhat node
```

3 - Console #1: In a different window, deploy contracts and seed them:

```bash
$ npx hardhat run scripts/deployTest.ts --network local && npx hardhat run scripts/seedTest.ts --network local
```

4 - Console #3: From the root of this repository directory launch `graph-node`

```bash
$ docker-compose build && docker-compose up
```

5 - Console #4: From the root of this repository directory lunch, build create and deploy the subgraph

```bash
$ yarn build:local
$ yarn create:local
$ yarn deploy:local
```

## Updated Instructions for local

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
