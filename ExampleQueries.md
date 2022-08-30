# Lyra Subgraph Example GraphQL Queries

## General Notes:

- Queries return the first 100 entities by default, but can return up to 1000 if you specify `first:1000`
- Snapshots are stored for different aggregation levels using the `period` field, which is the number of seconds the snapshot represents. For example: `3600` would represent an hourly period.
- Cumulative (volume, fees, etc) snapshots store multiple snapshots for the same period, while non-cumulative snapshots (Prices, greeks, etc) do not. This means the sytax to get hourly snapshots is `period_gte:3600` in some cases but `period:3600` in others. Make sure to check the docs to be sure of which one to use.

## List all Markets, Active Expiries, and Active Strikes

```graphql
{
  markets {
    id
    name
    boards(where: { isExpired: false }) {
      id
      expiryTimestampReadable
      strikes {
        id
        strikePriceReadable
      }
    }
  }
}
```

## Get the hourly spot price history for a market

_Replace {MarketId} with the relevant ID_

```graphql
{
  market(id: "{MarketId}") {
    spotPriceHistory(where: { period_gte: 3600 }, orderBy: timestamp, orderDirection: desc) {
      timestamp
      spotPrice
    }
  }
}
```

## Get all open positions for a user

```graphql
{
  positions(where: { owner: "{Address}", state: 1 }) {
    size
  }
}
```

## Get the hourly strike IV history for a specific strike

_StrikeId is the graphql strike Id_

```graphql
{
  strike(id: "{StrikeId}") {
    id
    strikeIVAndGreeksHistory(first: 1000, where: { period_gte: 3600 }, orderBy: timestamp, orderDirection: desc) {
      timestamp
      iv
    }
  }
}
```

## Get the hourly option price history for a specific option

_OptionId is the graphql option Id_

```graphql
{
  option(id: "{optionId}") {
    id
    optionPriceAndGreeksHistory(first: 1000, where: { period_gte: 3600 }, orderBy: timestamp, orderDirection: desc) {
      timestamp
      optionPrice
    }
  }
}
```

## Get the hourly pool token price history

```graphql
{
  marketTotalValueSnapshots(
    first: 1000
    where: { market: "{StrikeId}", period_gte: 3600 }
    orderBy: timestamp
    orderDirection: desc
  ) {
    tokenPrice
  }
}
```

## Get the hourly market volume history

```graphql
{
  marketVolumeAndFeesSnapshots(
    first: 1000
    where: { market: "{StrikeId}", period: 3600 }
    orderBy: timestamp
    orderDirection: desc
  ) {
    notionalVolume
    premiumVolume
  }
}
```
