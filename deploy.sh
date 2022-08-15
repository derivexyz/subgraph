#!/bin/bash
network=$1
type=$2
GRAPH=${GRAPH:-graph}

#$GRAPH deploy $SUBGRAPH_NAME --access-token $ACCESS_TOKEN --node https://api.thegraph.com/deploy/ --ipfs https://api.thegraph.com/ipfs/ --network $network --type $type subgraph.js

graphNetwork=$network

if [ $network = 'kovan-ovm' ]; then
  graphNetwork='optimism-kovan'
  subgraphName=$KOVAN_SUBGRAPH_NAME
elif [ $network = 'goerli-ovm' ]; then
  graphNetwork='optimism-goerli'
  subgraphName=$GOERLI_SUBGRAPH_NAME
elif [ $network = 'mainnet-ovm' ]; then
  graphNetwork='optimism'
  subgraphName=$SUBGRAPH_NAME
fi

NETWORK=$graphNetwork $GRAPH deploy $subgraphName --product hosted-service --access-token $ACCESS_TOKEN --node https://api.thegraph.com/deploy/ --ipfs https://api.thegraph.com/ipfs/ --network $network --type $type subgraph.js