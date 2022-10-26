#!/bin/bash
network=$1
type=$2
version=$3
GRAPH=${GRAPH:-graph}

graphNetwork=$network

if [ $network = 'kovan-ovm' ]; then
  graphNetwork='optimism-kovan'
elif [ $network = 'goerli-ovm' ]; then
  graphNetwork='optimism-goerli'
elif [ $network = 'mainnet-ovm' ]; then
  graphNetwork='optimism'
fi

NETWORK=$graphNetwork $GRAPH deploy optimism-mainnet --version-label $version --node https://app.satsuma.xyz/api/subgraphs/deploy --deploy-key $SATSUMA_KEY --network $network --type $type subgraph.js