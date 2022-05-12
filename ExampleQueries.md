# Lyra Subgraph Example GraphQL Queries

## General Notes:
- Queries return the first 100 entities by default, but can return up to 1000 if you specify `first:1000`
- Snapshots are stored for different aggregation levels using the `period` field, which is the number of seconds the snapshot represents. For example: `900` would represent a 15min period.
- Cumulative (volume, fees, etc) snapshots store multiple snapshots for the same period, while non-cumulative snapshots (Prices, greeks, etc) do not.  This means the sytax to get 15min snapshots is `period_gte:900` in some cases but `period:900` in others.  Make sure to check the docs to be sure of which one to use.


## List all Markets, Active Expiries, and Active Strikes
```graphql
{
  markets{
    id
    name
      boards(where:{isExpired:false}){
        id
        expiryTimestampReadable
        strikes{
          id
          strikePriceReadable
        }
      }
  }
}
```

## Get the 15min spot price history for a market
*Replace {MarketId} with the relevant ID*
```graphql
{
  market(id: "{MarketId}") {
    spotPriceHistory(where: {period_gte: 900}, orderBy: timestamp, orderDirection: desc) {
      timestamp
      spotPrice
    }
  }
}
```

## Get all open positions for a user
```graphql
{
  positions(where: {owner: "{Address}", state: 1}) {
    size
  }
}

```

## Get the hourly strike IV history for a specific strike
*StrikeId is the graphql strike Id*
```graphql
{
  strike(id: "{StrikeId}") {
    id
    strikeIVAndGreeksHistory(first: 1000, where: {period_gte: 3600}, orderBy: timestamp, orderDirection: desc) {
      timestamp
      iv
    }
  }
}
```

## Get the 15min option price history for a specific option
*OptionId is the graphql option Id*
```graphql
{
  option(id: "{optionId}") {
    id
    optionPriceAndGreeksHistory(first: 1000, where: {period_gte: 900}, orderBy: timestamp, orderDirection: desc) {
      timestamp
      optionPrice
    }
  }
}

```

## Get the hourly pool token price history
```graphql
{
  marketTotalValueSnapshots(first:1000 where:{market:"{StrikeId}" period_gte: 3600} orderBy:timestamp orderDirection:desc){
    tokenPrice
  }
}

```

## Get the hourly market volume history
```graphql
{
  marketVolumeAndFeesSnapshots(first:1000 where:{market:"{StrikeId}" period: 3600} orderBy:timestamp orderDirection:desc){
    notionalVolume
    premiumVolume
  }
}

```

```graphql
{
    candles(first:1000,
        where:{synth:\"sETH\",
        timestamp_gt:1652008543,
        timestamp_lt:1652278543,
        period:900},
        orderBy:\"id\",
        orderDirection:\"asc\")
    {id synth open high low close timestamp average period aggregatedPrices}}

```