#!/bin/bash
network=$1
deployType=$2

GRAPH=${GRAPH:-graph}

graphNetwork=$network

if [ $network = 'kovan-ovm' ]; then
  graphNetwork='optimism-kovan'
elif [ $network = 'goerli-ovm' ]; then
  graphNetwork='optimism-goerli'
elif [ $network = 'mainnet-ovm' ]; then
  graphNetwork='optimism'
fi

NETWORK=$graphNetwork $GRAPH codegen subgraph.js -o generated --network $network --type $deployType
NETWORK=$graphNetwork $GRAPH build subgraph.js --network $network --type $deployType
