import { Address, Bytes, BigInt, dataSource, log } from '@graphprotocol/graph-ts'
import { Global, Position, Trade, OptionTransfer, Option } from '../../generated/schema'
import { PositionUpdated, Transfer } from '../../generated/templates/OptionToken/OptionToken'
import { Entity, ZERO, ZERO_ADDRESS } from '../lib'

export function updatePositionCollateralHistory(
  optionMarketId: string,
  boardId: string,
  strikeId: string,
  optionId: string,
  positionId: i32,
  txHash: Bytes,
  timestamp: i32,
  newCollateral: BigInt,
  blockNumber: i32,
  isBaseCollateral: boolean,
  owner: Bytes,
): void {
  let positionCollateralUpdate = Entity.loadOrCreatePositionCollateralUpdate(
    optionMarketId,
    positionId,
    txHash,
    timestamp,
    blockNumber,
  )
  positionCollateralUpdate.isBaseCollateral = isBaseCollateral
  positionCollateralUpdate.market = optionMarketId
  positionCollateralUpdate.board = boardId
  positionCollateralUpdate.strike = strikeId
  positionCollateralUpdate.option = optionId
  positionCollateralUpdate.amount = newCollateral
  positionCollateralUpdate.trader = owner
  positionCollateralUpdate.save()
}

//Handles transfers from the wrapper to end user so we have the correct trader address
export function handlePositionTransfered(event: Transfer): void {
  let globals = Global.load('1') as Global

  //Transfer happens before we have any data about the position in those cases
  if (event.params.from == Bytes.fromHexString(ZERO_ADDRESS)) {
    let context = dataSource.context()

    let position = Entity.loadOrCreatePosition(
      context.getString('market'),
      event.params.tokenId.toI32(),
      event.block.timestamp.toI32(),
      event.params.to,
    )
    position.save()
  } else if (
    event.params.to != Bytes.fromHexString(ZERO_ADDRESS) &&
    event.params.to != changetype<Address>(globals.wrapperAddress)
  ) {
    let context = dataSource.context()
    let positionId = Entity.getPositionID(context.getString('market'), event.params.tokenId.toI32())
    let position = Position.load(positionId) as Position

    let trade = Trade.load(Entity.getTradeIDFromPositionID(positionId, event.transaction.hash))
    if (trade != null) {
      trade.trader = event.params.to
      trade.save()
    }

    if (event.params.from != changetype<Address>(globals.wrapperAddress)) {
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
    if (position.state == Entity.PositionState.LIQUIDATED) {
      updatePositionCollateralHistory(
        marketAddress,
        option.board,
        option.strike,
        option.id,
        event.params.position.positionId.toI32(),
        event.transaction.hash,
        event.block.timestamp.toI32(),
        ZERO,
        event.block.number.toI32(),
        position.isBaseCollateral,
        position.owner,
      )
      position.collateral = ZERO
    } else if (position.state == Entity.PositionState.CLOSED) {
      updatePositionCollateralHistory(
        marketAddress,
        option.board,
        option.strike,
        option.id,
        event.params.position.positionId.toI32(),
        event.transaction.hash,
        event.block.timestamp.toI32(),
        ZERO,
        event.block.number.toI32(),
        position.isBaseCollateral,
        position.owner,
      )
      position.collateral = event.params.position.collateral
    } else if (position.state == Entity.PositionState.SETTLED) {
      //Dont create collateral update on settlement
      position.collateral = ZERO
    } else {
      updatePositionCollateralHistory(
        marketAddress,
        option.board,
        option.strike,
        option.id,
        event.params.position.positionId.toI32(),
        event.transaction.hash,
        event.block.timestamp.toI32(),
        event.params.position.collateral,
        event.block.number.toI32(),
        position.isBaseCollateral,
        event.params.owner,
      )
      position.collateral = event.params.position.collateral
    }
  }

  //If position is settled, we don't want to set size to 0
  if (position.state != Entity.PositionState.SETTLED) {
    position.size = event.params.position.amount
  }
  position.save()
}
