import fs from 'fs-extra'
import path from 'path'

const getLyraFile = (type: string) => {
  switch (type) {
    case 'real':
      return 'lyra.json'
    case 'mockSnx':
    case 'realPricing':
      return `lyra.${type}.json`
    default:
      throw Error('invalid lyra deployment type')
  }
}

const getSynthetixFile = (type: string) => {
  switch (type) {
    case 'real':
    case 'realPricing':
      return 'synthetix.json'
    case 'mockSnx':
      return `synthetix.mocked.json`
    default:
      throw Error('invalid synthetix deployment type')
  }
}

const NETWORKS = ['local', 'local-ovm', 'kovan-ovm', 'mainnet-ovm', 'goerli-ovm']
const TYPES = ['real', 'mockSnx', 'realPricing']

async function run() {
  const baseDir = path.join(__dirname, '../')
  const lyraDeploymentDir = path.join(baseDir, '../lyra/deployments') // assume adjacent

  const networkIndex = process.argv.findIndex((arg) => arg.includes('--network'))
  const network = process.argv[networkIndex + 1]
  const typeIndex = process.argv.findIndex((arg) => arg.includes('--type'))
  const type = process.argv[typeIndex + 1]

  if (!NETWORKS.includes(network)) {
    throw Error(`No network provided: ${NETWORKS.join(', ')}`)
  }
  if (!TYPES.includes(type)) {
    throw Error(`No type provided: ${TYPES}.join(', ')`)
  }

  console.log('=== Syncing address maps ===')

  const lyraFile = path.join(lyraDeploymentDir, network, getLyraFile(type))
  if (fs.existsSync(lyraFile)) {
    const data = require(lyraFile)
    const outFile = path.join(baseDir, 'addresses', network, getLyraFile(type))
    console.log('Copy', getLyraFile(type))
    await fs.ensureFile(outFile)
    fs.outputJsonSync(outFile, data.targets, { replacer: null, spaces: 2 })
  }

  const synthetixFile = path.join(lyraDeploymentDir, network, getSynthetixFile(type))
  if (fs.existsSync(synthetixFile)) {
    const data = require(synthetixFile)
    const outFile = path.join(baseDir, 'addresses', network, getSynthetixFile(type))
    console.log('Copy', getSynthetixFile(type))
    await fs.ensureFile(outFile)
    fs.outputJsonSync(outFile, data.targets, { replacer: null, spaces: 2 })
  }

  console.log('=== Syncing ABIs ===')

  const abiDir = path.join(baseDir, 'abis', network)

  if (fs.pathExistsSync(abiDir)) {
    await fs.rmdirSync(abiDir, { recursive: true })
  }

  const synthetixData = require(path.join(lyraDeploymentDir, network, getSynthetixFile(type)))
  for (const source in synthetixData.sources) {
    const outFile = path.join(abiDir, source + '.json')
    console.log('Sync', source)
    await fs.ensureFile(outFile)
    fs.outputJsonSync(outFile, synthetixData.sources[source].abi, { replacer: null, spaces: 2 })
  }

  const lyraData = require(path.join(lyraDeploymentDir, network, getLyraFile(type)))
  for (const source in lyraData.sources) {
    const outFile = path.join(abiDir, source + '.json')
    console.log('Sync', source)
    await fs.ensureFile(outFile)
    fs.outputJsonSync(outFile, lyraData.sources[source].abi, { replacer: null, spaces: 2 })
  }
}

run().then(() => process.exit(0))
