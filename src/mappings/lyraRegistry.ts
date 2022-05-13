import { MarketUpdated, MarketRemoved, GlobalAddressUpdated } from '../../generated/LyraRegistry/LyraRegistry'
import { SynthetixAdapter } from '../../generated/LyraRegistry/SynthetixAdapter'
import { ExchangeRates } from '../../generated/LyraRegistry/ExchangeRates'

import {
  LiquidityPool as LiquidityPoolTemplate,
  OptionMarket as OptionMarketTemplate,
  OptionMarketPricer as OptionMarketPricerTemplate,
  OptionGreekCache as OptionGreekCacheTemplate,
  OptionToken as OptionTokenTemplate,
  ShortCollateral as ShortCollateralTemplate,
  PoolHedger as PoolHedgerTemplate,
  SynthetixAdapter as SynthetixAdapterTemplate,
  OptionMarketWrapper as OptionMarketWrapperTemplate,
} from '../../generated/templates'

import {
  Market,
  Pool,
  GreekCache,
  OptionToken,
  OptionMarketPricer,
  ShortCollateral,
  PoolHedger,
  Global,
} from '../../generated/schema'
import { Entity, ZERO, PERIODS, UNIT, HOUR_SECONDS, ZERO_ADDRESS, Snapshot } from '../lib'
import { log, Address, Bytes, BigInt, DataSourceContext, dataSource } from '@graphprotocol/graph-ts'
import { addProxyAggregator } from './latestRates'
import { updatePendingLiquiditySnapshot } from './liquidityPool'

export function createPoolHedger(poolHedgerAddress: Address, timestamp: i32): PoolHedger {
  let poolHedgerId = Entity.getIDFromAddress(poolHedgerAddress)
  let poolHedger = new PoolHedger(poolHedgerId)

  let poolHedgerSnapshot = Entity.loadOrCreatePoolHedgerSnapshot(poolHedgerAddress, HOUR_SECONDS, timestamp)
  poolHedgerSnapshot.save()

  poolHedger.latestPoolHedgerExposure = poolHedgerSnapshot.id

  return poolHedger
}

//Creates the Chainlink Aggregator data source and initial spot price entities
export function createPriceFeed(optionMarketAddress: Address, baseKey: Bytes, timestamp: i32): BigInt {
  let global = Entity.loadOrCreateGlobal() as Global
  // let exchangeRatesAddress = changetype<Address>(
  //   changetype<Address>(Bytes.fromHexString('0xF62Da62b5Af8B0cae27B1D9D8bB0Adb94EB4c1e2')),
  // ) //TODO: Switch back to global.exchangeRatesAddress

  let exchangeRatesAddress = changetype<Address>(global.exchangeRatesAddress)

  let er = ExchangeRates.bind(exchangeRatesAddress)
  let aggregatorAddress = er.try_aggregators(baseKey)

  //TODO: REMOVE THIS FOR MAINNET DEPLOYMENT
  if (dataSource.network() == 'optimism-kovan' && aggregatorAddress.reverted) {
    er = ExchangeRates.bind(changetype<Address>(Bytes.fromHexString('0xF62Da62b5Af8B0cae27B1D9D8bB0Adb94EB4c1e2'))) //Kovan ExchangeRates Address
    aggregatorAddress = er.try_aggregators(baseKey)
  }

  if (!aggregatorAddress.reverted) {
    let optionMarketId = Entity.getIDFromAddress(optionMarketAddress)
    addProxyAggregator(aggregatorAddress.value, optionMarketId)

    let r = er.rateForCurrency(baseKey)

    //Get the largest relevant period
    let base_period = PERIODS[0]
    let period_timestamp = Snapshot.roundTimestamp(timestamp, base_period)
    for (let p = 1; p < PERIODS.length; p++) {
      if (Snapshot.roundTimestamp(timestamp, PERIODS[p]) == period_timestamp) {
        base_period = PERIODS[p]
      }
    }

    let spotPriceSnapshot = Entity.createSpotPriceSnapshot(optionMarketId, base_period, timestamp)
    spotPriceSnapshot.spotPrice = r
    spotPriceSnapshot.save()

    return r
  } else {
    log.error('Failed to retrieve aggregator for: {}', [baseKey.toString()])
  }
  return ZERO
}

export function handleGlobalAddressUpdated(event: GlobalAddressUpdated): void {
  let changedAddress = event.params.name.toString()

  if (changedAddress == 'SYNTHETIX_ADAPTER') {
    let global = Entity.loadOrCreateGlobal()
    global.synthetixAdapter = event.params.addr
    global.save()
    SynthetixAdapterTemplate.create(event.params.addr)
  } else if (changedAddress == 'MARKET_VIEWER') {
    let global = Entity.loadOrCreateGlobal()
    global.viewerAddress = event.params.addr
    global.save()
  } else if (changedAddress == 'MARKET_WRAPPER') {
    let global = Entity.loadOrCreateGlobal()
    global.wrapperAddress = event.params.addr
    global.save()
    OptionMarketWrapperTemplate.create(event.params.addr)
  }
}

//Initializes all datasources and entities for the new market
export function handleMarketUpdated(event: MarketUpdated): void {
  let global = Entity.loadOrCreateGlobal()
  let timestamp = event.block.timestamp.toI32()

  let context = new DataSourceContext()
  context.setString('market', event.params.market.optionMarket.toHex())
  LiquidityPoolTemplate.createWithContext(event.params.market.liquidityPool, context)
  OptionMarketTemplate.createWithContext(event.params.market.optionMarket, context)
  OptionMarketPricerTemplate.createWithContext(event.params.market.optionMarketPricer, context)
  OptionGreekCacheTemplate.createWithContext(event.params.market.greekCache, context)
  OptionTokenTemplate.createWithContext(event.params.market.optionToken, context)
  ShortCollateralTemplate.createWithContext(event.params.market.shortCollateral, context)
  PoolHedgerTemplate.createWithContext(event.params.market.poolHedger, context)

  let marketId = Entity.getIDFromAddress(event.params.market.optionMarket)
  let poolId = Entity.getIDFromAddress(event.params.market.liquidityPool)
  let greekCacheId = Entity.getIDFromAddress(event.params.market.greekCache)
  let optionMarketPricerId = Entity.getIDFromAddress(event.params.market.optionMarketPricer)
  let optionTokenId = Entity.getIDFromAddress(event.params.market.optionToken)
  let shortCollateralId = Entity.getIDFromAddress(event.params.market.shortCollateral)

  let market = new Market(marketId)
  let marketVolumeAndFeesSnapshot = Entity.loadOrCreateMarketVolumeAndFeesSnapshot(
    marketId,
    HOUR_SECONDS,
    timestamp,
  )

  let marketSNXFeesSnapshot = Entity.loadOrCreateMarketSNXFeesSnapshot(
    market.id,
    HOUR_SECONDS,
    timestamp,
  )

  let marketTotalValueSnapshot = Entity.createMarketTotalValueSnapshot(
    marketId,
    HOUR_SECONDS,
    timestamp,
  )
  marketTotalValueSnapshot.NAV = ZERO
  marketTotalValueSnapshot.netOptionValue = ZERO
  marketTotalValueSnapshot.burnableLiquidity = ZERO
  marketTotalValueSnapshot.freeLiquidity = ZERO
  marketTotalValueSnapshot.pendingDeltaLiquidity = ZERO
  marketTotalValueSnapshot.usedCollatLiquidity = ZERO
  marketTotalValueSnapshot.usedDeltaLiquidity = ZERO
  marketTotalValueSnapshot.baseBalance = ZERO
  marketTotalValueSnapshot.tokenPrice = UNIT

  let marketGreeksSnapshot = Entity.createMarketGreeksSnapshot(marketId, HOUR_SECONDS, timestamp)
  marketGreeksSnapshot.netDelta = ZERO
  marketGreeksSnapshot.netGamma = ZERO
  marketGreeksSnapshot.netStdVega = ZERO

  let pool = new Pool(poolId)
  let greekCache = new GreekCache(greekCacheId)
  let optionMarketPricer = new OptionMarketPricer(optionMarketPricerId)
  let optionToken = new OptionToken(optionTokenId)
  let shortCollateral = new ShortCollateral(shortCollateralId)
  let poolHedger = createPoolHedger(event.params.market.poolHedger, timestamp)

  // config
  market.global = global.id
  market.owner = event.transaction.from
  market.rateAndCarry = ZERO
  market.standardSize = ZERO
  market.skewAdjustmentFactor = ZERO
  market.address = event.params.market.optionMarket
  market.quoteAddress = event.params.market.quoteAsset
  market.baseAddress = event.params.market.baseAsset
  market.isRemoved = false
  market.latestVolumeAndFees = marketVolumeAndFeesSnapshot.id
  market.latestSNXFees = marketSNXFeesSnapshot.id
  market.latestTotalValue = marketTotalValueSnapshot.id
  market.tradingCutoff = ZERO.toI32()
  market.latestGreeks = marketGreeksSnapshot.id
  market.liquidityPool = pool.id
  market.greekCache = greekCache.id
  market.optionMarketPricer = optionMarketPricer.id
  market.optionToken = optionToken.id
  market.shortCollateral = shortCollateral.id
  market.poolHedger = poolHedger.id
  market.activeBoardIds = []
  market.chainlinkAggregator = Bytes.fromHexString(ZERO_ADDRESS)
  market.latestSpotPrice = ZERO

  //Get and Set baseKey and quoteKey
  let synthetixAdapterContract = SynthetixAdapter.bind(changetype<Address>(global.synthetixAdapter))
  let baseKey = synthetixAdapterContract.baseKey(event.params.market.optionMarket)
  let quoteKey = synthetixAdapterContract.quoteKey(event.params.market.optionMarket)
  market.baseKey = baseKey
  market.quoteKey = quoteKey
  market.name = baseKey.toString() //TODO: String leading "s"

  //References:
  pool.market = marketId
  pool.baseBalance = ZERO
  pool.tokenPrice = UNIT

  shortCollateral.market = marketId

  greekCache.market = marketId
  optionMarketPricer.market = marketId
  optionToken.market = marketId
  poolHedger.market = marketId

  market.save()
  marketVolumeAndFeesSnapshot.save()
  marketSNXFeesSnapshot.save()
  marketTotalValueSnapshot.save()
  marketGreeksSnapshot.save()
  pool.save()
  updatePendingLiquiditySnapshot(pool.id, timestamp, ZERO, ZERO)
  greekCache.save()
  optionMarketPricer.save()
  optionToken.save()
  shortCollateral.save()
  poolHedger.save()

  //Market needs to be created before this
  let latestSpotPrice = createPriceFeed(event.params.market.optionMarket, baseKey, event.block.timestamp.toI32())
  if (latestSpotPrice != ZERO) {
    market.latestSpotPrice = latestSpotPrice as BigInt
  } else {
    market.latestSpotPrice = BigInt.fromI32(2500).times(UNIT) //TODO: SET TO 0 FOR DEPLOYMENT
  }
  market.save()

  log.info('Created Market {}', [market.name])
}

export function handleMarketRemoved(event: MarketRemoved): void {
  let market = Entity.loadMarket(event.params.market)
  market.isRemoved = true
  market.save()
  log.info('Market removed: {}', [event.params.market.toHex()])
}
