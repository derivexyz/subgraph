const path = require('path')

const getDeploymentFile = (type) => {
  switch (type) {
    case 'real':
      return 'lyra.json'
    case 'mockSnx':
    case 'realPricing':
      return `lyra.${type}.json`
    default:
      throw Error('invalid deployment type ' + type)
  }
}

const getNetwork = (networkForPath) => {
  switch (networkForPath) {
    case 'local-ovm':
    case 'local':
    case 'kovan-ovm':
      return 'optimism-kovan'
    case 'mainnet-ovm':
      return 'optimism'
    default:
      throw Error('invalid network type')
  }
}
const networkIndex = process.argv.findIndex((arg) => arg.includes('--network'))
const networkForPath = process.argv[networkIndex + 1]

const typeIndex = process.argv.findIndex((arg) => arg.includes('--type'))
const type = process.argv[typeIndex + 1]

const lyraData = require(path.join('./addresses', networkForPath, getDeploymentFile(type)))
const network = getNetwork(networkForPath)

const getABIPath = (contractName) => path.join('./abis', networkForPath, contractName + '.json')

////// ////// ////// //////
////// DATA SOURCES  //////
////// ////// ////// //////
let registryStart = lyraData['LyraRegistry'].blockNumber - 20000
registryStart = registryStart < 0 ? 0 : registryStart
console.log(type)
console.log(network)
console.log(lyraData['LyraRegistry'].blockNumber)
console.log(registryStart)
//LyraRegistry is the only hardcoded address and the source of truth for other addresses
const dataSources = [
  {
    kind: 'ethereum/contract',
    name: 'LyraRegistry',
    network,
    source: {
      address: lyraData['LyraRegistry'].address,
      startBlock: registryStart,
      abi: 'LyraRegistry',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/LyraRegistry.ts',
      entities: ['Market'], //This value is currently not used by TheGraph at all, it just cant be empty
      abis: [
        {
          name: 'LyraRegistry',
          file: getABIPath('LyraRegistry'),
        },
        {
          name: 'OptionMarketViewer',
          file: getABIPath('OptionMarketViewer'),
        },
        {
          name: 'SynthetixAdapter',
          file: getABIPath('SynthetixAdapter'),
        },
        {
          name: 'ExchangeRates',
          file: './abis/synthetix/ExchangeRates.json',
        },
        {
          name: 'AggregatorProxy',
          file: './abis/synthetix/AggregatorProxy.json',
        },
      ],
      eventHandlers: [
        {
          event:
            'MarketUpdated(indexed address,(address,address,address,address,address,address,address,address,address,address,address))',
          handler: 'handleMarketUpdated',
        },
        {
          event: 'MarketRemoved(indexed address)',
          handler: 'handleMarketRemoved',
        },
        {
          event: 'GlobalAddressUpdated(indexed bytes32,address)',
          handler: 'handleGlobalAddressUpdated',
        },
      ],
    },
  },
]

////// ////// ////// //////
////// TEMPLATES  //////
////// ////// ////// //////

const templates = [
  {
    kind: 'ethereum/contract',
    name: 'OptionMarketWrapper',
    network,
    source: {
      abi: 'OptionMarketWrapper',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/OptionMarketWrapper.ts',
      entities: ['Market'], //This value is currently not used by TheGraph at all, it just cant be empty
      abis: [
        {
          name: 'OptionMarketWrapper',
          file: getABIPath('OptionMarketWrapper'),
        },
      ],
      eventHandlers: [
        {
          event:
            'PositionTraded(bool,bool,indexed address,indexed uint256,indexed address,uint256,uint256,uint256,int256,address)',
          handler: 'handlePositionTraded',
        },
      ],
    },
  },
  {
    kind: 'ethereum/contract',
    name: 'SynthetixAdapter',
    network,
    source: {
      abi: 'SynthetixAdapter',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/SynthetixAdapter.ts',
      entities: ['Market'], //This value is currently not used by TheGraph at all, it just cant be empty
      abis: [
        {
          name: 'SynthetixAdapter',
          file: getABIPath('SynthetixAdapter'),
        },
      ],
      eventHandlers: [
        {
          event: 'SynthetixAddressesUpdated(address,address,address,address)',
          handler: 'handleSynthetixAddressesUpdated',
        },
        {
          event: 'AddressResolverSet(address)',
          handler: 'handleAddressResolverSet',
        },
        {
          event: 'BaseSwappedForQuote(indexed address,indexed address,uint256,uint256)',
          handler: 'handleBaseSwappedForQuote',
        },
        {
          event: 'QuoteSwappedForBase(indexed address,indexed address,uint256,uint256)',
          handler: 'handleQuoteSwappedForBase',
        },
      ],
    },
  },
  {
    kind: 'ethereum/contract',
    name: 'LiquidityPool',
    network,
    source: {
      abi: 'LiquidityPool',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/liquidityPool.ts',
      entities: ['Market'],
      abis: [
        {
          name: 'LiquidityPool',
          file: getABIPath('LiquidityPool'),
        },
        {
          name: 'ERC20',
          file: './abis/common/ERC20.json',
        },
      ],
      eventHandlers: [
        {
          event: 'DepositQueued(indexed address,indexed address,indexed uint256,uint256,uint256,uint256)',
          handler: 'handleDepositQueued',
        },
        {
          event: 'DepositProcessed(indexed address,indexed address,indexed uint256,uint256,uint256,uint256,uint256)',
          handler: 'handleDepositProcessed',
        },
        {
          event: 'WithdrawQueued(indexed address,indexed address,indexed uint256,uint256,uint256,uint256)',
          handler: 'handleWithdrawQueued',
        },
        {
          event: 'WithdrawProcessed(indexed address,indexed address,indexed uint256,uint256,uint256,uint256,uint256,uint256)',
          handler: 'handleWithdrawProcessed',
        },
        {
          event:
            'WithdrawPartiallyProcessed(indexed address,indexed address,indexed uint256,uint256,uint256,uint256,uint256,uint256)',
          handler: 'handleWithdrawPartiallyProcessed',
        },
        {
          event: 'PoolHedgerUpdated(address)',
          handler: 'handlePoolHedgerUpdated',
        },
        {
          event: 'CircuitBreakerUpdated(uint256,bool,bool,bool)',
          handler: 'handleCircuitBreakerUpdated',
        },
        {
          event: 'BasePurchased(uint256,uint256)',
          handler: 'handleBasePurchased',
        },
        {
          event: 'BaseSold(uint256,uint256)',
          handler: 'handleBaseSold',
        },
      ],
    },
  },
  {
    kind: 'ethereum/contract',
    name: 'OptionMarketPricer',
    network,
    source: {
      abi: 'OptionMarketPricer',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/OptionMarketPricer.ts',
      entities: ['Market'],
      abis: [
        {
          name: 'OptionMarketPricer',
          file: getABIPath('OptionMarketPricer'),
        },
      ],
      eventHandlers: [
        {
          event: 'PricingParametersSet((uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))',
          handler: 'handlePricingParametersSet',
        },
        {
          event:
            'TradeLimitParametersSet((int256,int256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool))',
          handler: 'handleTradeLimitParametersSet',
        },
      ],
    },
  },
  {
    kind: 'ethereum/contract',
    name: 'OptionMarket',
    network,
    source: {
      abi: 'OptionMarket',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/optionMarket.ts',
      entities: ['Market'],
      abis: [
        {
          name: 'OptionMarket',
          file: getABIPath('OptionMarket'),
        },
        {
          name: 'OptionGreekCache',
          file: getABIPath('OptionGreekCache'),
        },
        {
          name: 'OptionMarketViewer',
          file: getABIPath('OptionMarketViewer'),
        },
        {
          name: 'ERC20',
          file: './abis/common/ERC20.json',
        },
      ],
      eventHandlers: [
        {
          event: 'BoardCreated(indexed uint256,uint256,uint256,bool)',
          handler: 'handleBoardCreated',
        },
        {
          event:
            'Trade(indexed address,indexed uint256,indexed uint256,(uint256,uint256,uint8,uint8,uint256,uint256,bool,uint256,uint256,uint256),(uint256,uint256,uint256,uint256,(int256,int256,uint256,uint256,uint256,uint256),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint256,uint256,uint256,uint256,uint256)[],(address,address,uint256,uint256,uint256,uint256,uint256,uint256),uint256)',
          handler: 'handleTrade',
        },
        {
          event: 'OwnerChanged(address,address)',
          handler: 'handleOwnerChanged',
        },
        {
          event: 'BoardSettled(indexed uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)',
          handler: 'handleBoardSettled',
        },
        {
          event: 'BoardFrozen(indexed uint256,bool)',
          handler: 'handleBoardFrozen',
        },
        {
          event: 'BoardBaseIvSet(indexed uint256,uint256)',
          handler: 'handleBoardBaseIvSet',
        },
        {
          event: 'StrikeSkewSet(indexed uint256,uint256)',
          handler: 'handleStrikeSkewSet',
        },
        {
          event: 'StrikeAdded(indexed uint256,indexed uint256,uint256,uint256)',
          handler: 'handleStrikeAdded',
        },
      ],
    },
  },
  {
    kind: 'ethereum/contract',
    name: 'OptionGreekCache',
    network,
    source: {
      abi: 'OptionGreekCache',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/optionGreekCache.ts',
      entities: ['Market'],
      abis: [
        {
          name: 'OptionGreekCache',
          file: getABIPath('OptionGreekCache'),
        },
        {
          name: 'ERC20',
          file: './abis/common/ERC20.json',
        },
        {
          name: 'OptionMarketViewer',
          file: getABIPath('OptionMarketViewer'),
        },
        {
          name: 'LiquidityPool',
          file: getABIPath('LiquidityPool'),
        },
      ],
      eventHandlers: [
        {
          event:
            'StrikeCacheUpdated((uint256,uint256,uint256,uint256,(int256,int256,uint256,uint256,uint256),int256,int256,uint256))',
          handler: 'handleStrikeCacheUpdated',
        },
        {
          event:
            'BoardCacheUpdated((uint256,uint256[],uint256,uint256,(int256,int256,int256),uint256,uint256,uint256,uint256))',
          handler: 'handleBoardCacheUpdated',
        },
        {
          event: 'GlobalCacheUpdated((uint256,uint256,uint256,uint256,uint256,(int256,int256,int256)))',
          handler: 'handleGlobalCacheUpdated',
        },
        {
          event:
            'GreekCacheParametersSet((uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,int256))',
          handler: 'handleGreekCacheParametersSet',
        },
      ],
    },
  },
  {
    kind: 'ethereum/contract',
    name: 'OptionToken',
    network,
    source: {
      abi: 'OptionToken',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/OptionToken.ts',
      entities: ['Market'],
      abis: [
        {
          name: 'OptionToken',
          file: getABIPath('OptionToken'),
        },
      ],
      eventHandlers: [
        {
          event: 'PositionUpdated(indexed uint256,indexed address,indexed uint8,(uint256,uint256,uint8,uint256,uint256,uint8),uint256)',
          handler: 'handlePositionUpdated',
        },
        {
          event: 'Transfer(indexed address,indexed address,indexed uint256)',
          handler: 'handlePositionTransfered',
        },
      ],
    },
  },
  {
    kind: 'ethereum/contract',
    name: 'ShortCollateral',
    network,
    source: {
      abi: 'ShortCollateral',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/ShortCollateral.ts',
      entities: ['Market'],
      abis: [
        {
          name: 'ShortCollateral',
          file: getABIPath('ShortCollateral'),
        },
      ],
      eventHandlers: [
        {
          event: 'PositionSettled(indexed uint256,indexed address,indexed address,uint256,uint256,uint8,uint256,uint256,uint256)',
          handler: 'handlePositionSettled',
        },
        // {
        //   event: 'QuoteSent(indexed address,uint256)',
        //   handler: 'handleQuoteSent',
        // },
        {
          event: 'BaseSent(indexed address,uint256)',
          handler: 'handleBaseSent',
        },
        // {
        //   event: 'BaseExchangedAndQuoteSent(indexed address,uint256,uint256)',
        //   handler: 'handleBaseExchangedAndQuoteSent',
        // },
      ],
    },
  },
  {
    kind: 'ethereum/contract',
    name: 'ShortPoolHedger',
    network,
    source: {
      abi: 'ShortPoolHedger',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/ShortPoolHedger.ts',
      entities: ['Market'],
      abis: [
        {
          name: 'ShortPoolHedger',
          file: getABIPath('ShortPoolHedger'),
        },
      ],
      eventHandlers: [
        // {
        //   event: 'LongSetTo(uint256,uint256)',
        //   handler: 'handleLongSetTo',
        // },
        {
          event: 'PositionUpdated(int256,int256,int256)',
          handler: 'handlePositionUpdated',
        },
        // {
        //   event: 'ShortSetTo(uint256,uint256,uint256,uint256)',
        //   handler: 'handleShortSetTo',
        // },
      ],
    },
  },
  {
    kind: 'ethereum/contract',
    name: 'AggregatorProxy',
    network,
    source: {
      abi: 'AggregatorProxy',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/latestRates.ts',
      entities: ['Market'],
      abis: [
        {
          name: 'AggregatorProxy',
          file: './abis/synthetix/AggregatorProxy.json',
        },
      ],
      eventHandlers: [
        {
          event: 'AggregatorConfirmed(indexed address,indexed address)',
          handler: 'handleAggregatorProxyAddressUpdated',
        },
      ],
    },
  },
  {
    kind: 'ethereum/contract',
    name: 'Aggregator',
    network,
    source: {
      abi: 'Aggregator',
    },
    mapping: {
      kind: 'ethereum/events',
      apiVersion: '0.0.5',
      language: 'wasm/assemblyscript',
      file: './src/mappings/latestRates.ts',
      entities: ['Market'],
      abis: [
        {
          name: 'Aggregator',
          file: './abis/synthetix/Aggregator.json',
        },
        {
          name: 'ExchangeRates',
          file: './abis/synthetix/ExchangeRates.json',
        },
        {
          name: 'LiquidityPool',
          file: getABIPath('LiquidityPool'),
        },
      ],
      eventHandlers: [
        {
          event: 'AnswerUpdated(indexed int256,indexed uint256,uint256)',
          handler: 'handleAggregatorAnswerUpdated',
        },
      ],
    },
  },
]

module.exports = {
  specVersion: '0.0.2',
  description: 'Lyra',
  repository: 'https://github.com/lyra-finance/lyra-protocol-subgraph',
  schema: {
    file: './schema.graphql',
  },
  dataSources,
  templates,
}
