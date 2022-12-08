import { Address, Bytes, BigInt, dataSource, log, store } from '@graphprotocol/graph-ts'
import {
  Global,
  Position,
  Trade,
  OptionTransfer,
  Option,
  Market,
  Strike,
  CollateralUpdate,
} from '../../generated/schema'
import { PositionUpdated, Transfer } from '../../generated/templates/OptionToken/OptionToken'
import { Entity, UNIT, ZERO, ZERO_ADDRESS as ZERO_ADDRESS_ } from '../lib'

export function updatePositionCollateralHistory(
  optionMarketId: string,
  boardId: string,
  strikeId: string,
  optionId: string,
  positionId: i32,
  txHash: Bytes,
  timestamp: i32,
  newCollateral: BigInt,
  oldCollateral: BigInt,
  blockNumber: i32,
  isBaseCollateral: boolean,
  owner: Bytes,
  latestSpotPrice: BigInt,
  collateralPNL: BigInt,
): void {
  let positionCollateralUpdate = Entity.loadOrCreatePositionCollateralUpdate(
    optionMarketId,
    positionId,
    txHash,
    timestamp,
    blockNumber,
  )

  let collateralAmountChange = newCollateral.minus(oldCollateral)

  positionCollateralUpdate.isBaseCollateral = isBaseCollateral
  positionCollateralUpdate.market = optionMarketId
  positionCollateralUpdate.board = boardId
  positionCollateralUpdate.strike = strikeId
  positionCollateralUpdate.option = optionId
  positionCollateralUpdate.amount = newCollateral
  positionCollateralUpdate.trader = owner
  positionCollateralUpdate.spotPrice = latestSpotPrice
  positionCollateralUpdate.collateralAmountChange = collateralAmountChange
  positionCollateralUpdate.collateralPNL = collateralPNL
  positionCollateralUpdate.save()
}

//Handles transfers from the wrapper to end user so we have the correct trader address
export function handlePositionTransfered(event: Transfer): void {
  let globals = Global.load('1') as Global
  const ZERO_ADDRESS = Bytes.fromHexString(ZERO_ADDRESS_)

  //On closes, user -> wrapper -> burn - trade
  //On opens, trade - burn -> wrapper -> user

  const isMint = event.params.from == ZERO_ADDRESS
  const isBurn = event.params.to == ZERO_ADDRESS

  //Transfer happens before we have any data about the position in those cases
  if (isMint) {
    let context = dataSource.context()

    let position = Entity.loadOrCreatePosition(
      context.getString('market'),
      event.params.tokenId.toI32(),
      event.block.timestamp.toI32(),
      event.params.to,
    )
    position.latestFromAddress__ = ZERO_ADDRESS
    position.latestTransactionHash__ = event.transaction.hash
    position.save()
  } else if (isBurn) {
    // If the latest address != zero address and != from address, owner is the latest address
    // If the latest address is zero address or from address, owner is from
    let context = dataSource.context()
    let positionId = Entity.getPositionID(context.getString('market'), event.params.tokenId.toI32())
    let position = Position.load(positionId) as Position

    const isTransferFromWrapper = position.latestTransactionHash__ == event.transaction.hash

    if (isTransferFromWrapper) {
      //delete transfer, update owner
      store.remove(
        'OptionTransfer',
        Entity.getTransferID(context.getString('market'), event.params.tokenId.toI32(), event.transaction.hash),
      )
      position.owner = position.latestFromAddress__
      position.save()
    }

    let trade = Trade.load(Entity.getTradeIDFromPositionID(positionId, event.transaction.hash))
    if (trade != null) {
      trade.trader = position.owner
      trade.save()
    }

    let collateralUpdate = CollateralUpdate.load(
      Entity.getCollateralUpdateID(context.getString('market'), position.positionId, event.transaction.hash),
    )
    if (collateralUpdate != null) {
      collateralUpdate.trader = position.owner
      collateralUpdate.save()
    }
  } else {
    let context = dataSource.context()
    let positionId = Entity.getPositionID(context.getString('market'), event.params.tokenId.toI32())
    let position = Position.load(positionId) as Position

    let trade = Trade.load(Entity.getTradeIDFromPositionID(positionId, event.transaction.hash))
    if (trade != null) {
      trade.trader = event.params.to
      trade.save()
    }

    let collateralUpdate = CollateralUpdate.load(
      Entity.getCollateralUpdateID(context.getString('market'), position.positionId, event.transaction.hash),
    )
    if (collateralUpdate != null) {
      collateralUpdate.trader = event.params.to
      collateralUpdate.save()
    }

    const isTransferFromWrapper = position.latestTransactionHash__ == event.transaction.hash

    if (!isTransferFromWrapper) {
      // Actual transfer,
      let transferId = Entity.getTransferID(
        context.getString('market'),
        event.params.tokenId.toI32(),
        event.transaction.hash,
      )
      let transfer = new OptionTransfer(transferId)

      transfer.timestamp = event.block.timestamp.toI32()
      transfer.blockNumber = event.block.number.toI32()
      transfer.transactionHash = event.transaction.hash
      transfer.position = positionId
      transfer.oldOwner = position.owner
      transfer.newOwner = event.params.to
      transfer.save()

      position.latestFromAddress__ = event.params.from
      position.latestTransactionHash__ = event.transaction.hash
    } else {
      store.remove(
        'OptionTransfer',
        Entity.getTransferID(context.getString('market'), event.params.tokenId.toI32(), event.transaction.hash),
      )
    }

    position.owner = event.params.to
    position.save()
  }
}

export function handlePositionUpdated(event: PositionUpdated): void {
  let context = dataSource.context()
  let marketAddress = context.getString('market')

  let position = Entity.loadPosition(marketAddress, event.params.position.positionId.toI32())

  let option = Entity.loadOption(
    marketAddress,
    event.params.position.strikeId,
    Entity.getIsCall(event.params.position.optionType),
  ) as Option

  if (position.board == null) {
    position.board = option.board
    position.strike = option.strike
    position.option = option.id
    position.isLong = Entity.getIsLong(event.params.position.optionType)
    position.isBaseCollateral = Entity.getIsBaseCollateralized(event.params.position.optionType)
  }

  position.state = event.params.position.state

  if (position.state != Entity.PositionState.ACTIVE) {
    position.closeTimestamp = event.block.timestamp.toI32()
  }

  //Update the position collateral history for shorts
  if (!position.isLong) {
    let latestSpotPrice = (Market.load(marketAddress) as Market).latestSpotPrice

    if (position.state == Entity.PositionState.LIQUIDATED) {
      let collateralProfit = position.isBaseCollateral
        ? position.averageCollateralSpotPrice.minus(latestSpotPrice).times(position.collateral).div(UNIT)
        : ZERO
      position.collateralPNL = position.collateralPNL.plus(collateralProfit)

      updatePositionCollateralHistory(
        marketAddress,
        option.board,
        option.strike,
        option.id,
        event.params.position.positionId.toI32(),
        event.transaction.hash,
        event.block.timestamp.toI32(),
        ZERO,
        position.collateral,
        event.block.number.toI32(),
        position.isBaseCollateral,
        position.owner,
        latestSpotPrice,
        collateralProfit,
      )
      position.collateral = ZERO
    } else if (position.state == Entity.PositionState.CLOSED) {
      let collateralProfit = position.isBaseCollateral
        ? position.averageCollateralSpotPrice.minus(latestSpotPrice).times(position.collateral).div(UNIT)
        : ZERO
      position.collateralPNL = position.collateralPNL.plus(collateralProfit)
      updatePositionCollateralHistory(
        marketAddress,
        option.board,
        option.strike,
        option.id,
        event.params.position.positionId.toI32(),
        event.transaction.hash,
        event.block.timestamp.toI32(),
        ZERO,
        position.collateral,
        event.block.number.toI32(),
        position.isBaseCollateral,
        position.owner,
        latestSpotPrice,
        collateralProfit,
      )
      position.collateral = event.params.position.collateral
    } else if (position.state == Entity.PositionState.SETTLED) {
      //Dont create collateral update on settlement, dont update position.collateral.
      //We want settled positions to still show the ending size/collateral
      let collateralProfit = position.isBaseCollateral
        ? position.averageCollateralSpotPrice.minus(latestSpotPrice).times(position.collateral).div(UNIT)
        : ZERO
      position.collateralPNL = position.collateralPNL.plus(collateralProfit)
      //position.collateral = ZERO
    } else {
      let collateralProfit =
        position.isBaseCollateral && event.params.position.collateral < position.collateral
          ? position.averageCollateralSpotPrice
              .minus(latestSpotPrice)
              .times(position.collateral.minus(event.params.position.collateral))
              .div(UNIT)
          : ZERO
      position.collateralPNL = position.collateralPNL.plus(collateralProfit)
      updatePositionCollateralHistory(
        marketAddress,
        option.board,
        option.strike,
        option.id,
        event.params.position.positionId.toI32(),
        event.transaction.hash,
        event.block.timestamp.toI32(),
        event.params.position.collateral,
        position.collateral,
        event.block.number.toI32(),
        position.isBaseCollateral,
        event.params.owner,
        latestSpotPrice,
        collateralProfit,
      )

      //If base collateral is added, we need to adjust the avg cost
      if (position.isBaseCollateral && event.params.position.collateral > position.collateral) {
        // Average = ((Previous_Size_base * Prev_Avg_Cost) + (New_Collateral_Base * Current_Price)) / New_Collateral_Base
        position.averageCollateralSpotPrice = position.collateral
          .times(position.averageCollateralSpotPrice)
          .div(UNIT)
          .plus(event.params.position.collateral.minus(position.collateral).times(latestSpotPrice).div(UNIT))
          .times(UNIT)
          .div(event.params.position.collateral)
      }
      position.collateral = event.params.position.collateral
    }
  }

  //If position is settled, we don't want to set size to 0
  if (position.state != Entity.PositionState.SETTLED) {
    position.size = event.params.position.amount
  }
  position.save()
}
