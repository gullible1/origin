const assert = require('assert')
const Web3 = require('web3')

const ProxyFactoryBuild = require('@origin/contracts/build/contracts/ProxyFactory_solc.json')
const IdentityProxyBuild = require('@origin/contracts/build/contracts/IdentityProxy_solc.json')
const IdentityEventsBuild = require('@origin/contracts/build/contracts/IdentityEvents.json')

const Relayer = require('../src/relayer')

const {
  wait,
  eventSigInReceipt,
  getProxyAddress,
  mockRequest,
  mockResponse,
  hashTxdata,
  startMining,
  stopMining
} = require('./utils')

const {
  MNEMONIC_ONE,
  TEST_PROVIDER_URL,
  TEST_NET_ID,
  TWO_GWEI,
  JUNK_HASH,
  EVENT_SIG_IDENTITYUPDATED,
  EVENT_SIG_PROXYCREATION,
  EVENT_SIG_OWNERCHANGED
} = require('./const')

const web3 = new Web3(TEST_PROVIDER_URL)

function getAddresses() {
  const contractsJSON = require('@origin/contracts/build/tests.json')
  return contractsJSON
}


describe('Relayer', async () => {
  // Required here so hopefully it'll be generated by time of import
  let netId, ProxyFactory, IdentityEvents, Funder, Rando, Joe, IdentityProxyAddress

  let ProxyFactoryAddress, IdentityEventsAddress, IdentityProxyMaster

  before(async () => {
    netId = await web3.eth.net.getId()
    assert(netId === TEST_NET_ID, 'Not the expected test network!')

    const accounts = await web3.eth.getAccounts()
    Funder = accounts[0]
    Rando = accounts[1]
    Joe = accounts[2]

    const contractsJSON = getAddresses()

    console.log('contracts.json: ', contractsJSON)
    ProxyFactoryAddress = contractsJSON['ProxyFactory']
    IdentityEventsAddress = contractsJSON['IdentityEvents']
    IdentityProxyMaster = contractsJSON['IdentityProxyImplementation']

    ProxyFactory = new web3.eth.Contract(
      ProxyFactoryBuild.abi,
      ProxyFactoryAddress
    )

    IdentityEvents = new web3.eth.Contract(
      IdentityEventsBuild.abi,
      IdentityEventsAddress
    )

    process.env.FORWARDER_MNEMONIC = MNEMONIC_ONE
  })

  it('creates a proxy', async () => {
    const relayer = new Relayer(netId)
    
    // Init the keys now so we can fund them for the test
    await relayer.purse.init()

    // Fund the master account before Purse can send anything
    const masterAddress = relayer.purse.masterWallet.getChecksumAddressString()
    const masterReceipt = await web3.eth.sendTransaction({
      from: Funder,
      to: masterAddress,
      value: web3.utils.toWei('5', 'ether'),
      gas: 21000,
      gasPrice: TWO_GWEI
    })
    assert(masterReceipt.status, 'funding masterWallet failed')

    await wait(3000) // give it a few seconds to fund the children

    // Give Rando some cash
    const receipt = await web3.eth.sendTransaction({
      from: Funder,
      to: Rando,
      value: web3.utils.toWei('1', 'ether'),
      gas: 21000,
      gasPrice: TWO_GWEI
    })
    assert(receipt.status, 'funding failed')

    // Using IdentityEvents for testing because of its simplicity
    const txData = IdentityEvents.methods.emitIdentityUpdated(JUNK_HASH).encodeABI()

    // The proxied call
    const Proxy = new web3.eth.Contract(IdentityProxyBuild.abi)
    const proxyTxData = await Proxy.methods
      .changeOwnerAndExecute(Rando, IdentityEventsAddress, '0', txData)
      .encodeABI()

    // The create proxy call
    const createCallTxData = await ProxyFactory.methods.createProxyWithSenderNonce(IdentityProxyMaster, proxyTxData, Rando, '0').encodeABI()

    const txToSend = {
      from: Rando,
      to: ProxyFactoryAddress,
      txData: createCallTxData,
      nonce: '0' // TODO: Why does relayer peg this at 0?
    }
    const txDatahash = hashTxdata(web3, txToSend)
    const txToSendSignature = await web3.eth.sign(txDatahash, Rando)

    const request = mockRequest({
      headers: { 'x-real-ip': '98.210.130.145' },
      body: {
        ...txToSend,
        signature: txToSendSignature,
        proxy: null,
        preflight: false
      },
    })
    const response = mockResponse()

    await relayer.relay(request, response)

    assert(response.statusCode === 200, `response code is ${response.statusCode}`)
    assert(!response.body.errors, 'errors in response')
    assert(response.body.id, 'missing txhash')

    const proxyReceipt = await web3.eth.getTransactionReceipt(response.body.id)
    assert(proxyReceipt.status)

    // Verify the expected events are in the receipt
    assert(eventSigInReceipt(proxyReceipt, EVENT_SIG_IDENTITYUPDATED), 'missing IdentityUpdated event')
    assert(eventSigInReceipt(proxyReceipt, EVENT_SIG_PROXYCREATION), 'missing ProxyCreation event')
    assert(eventSigInReceipt(proxyReceipt, EVENT_SIG_OWNERCHANGED), 'missing OwnerChanged event')

    IdentityProxyAddress = getProxyAddress(proxyReceipt)

    await relayer.purse.teardown(true) // Testing cleanup only
  })

  it('uses a proxy', async () => {
    const relayer = new Relayer(netId)

    assert(IdentityProxyAddress, 'IdentityProxy address missing')

    // Using IdentityEvents for testing because of its simplicity
    const txData = IdentityEvents.methods.emitIdentityUpdated(JUNK_HASH).encodeABI()

    const Proxy = new web3.eth.Contract(IdentityProxyBuild.abi, IdentityProxyAddress)
    const proxyNonce = await Proxy.methods.nonce(Rando).call()

    const txToSend = {
      from: Rando,
      to: IdentityEventsAddress,
      txData: txData,
      nonce: proxyNonce
    }
    const txDatahash = hashTxdata(web3, txToSend)
    const txToSendSignature = await web3.eth.sign(txDatahash, Rando)

    const request = mockRequest({
      headers: { 'x-real-ip': '98.210.130.145' },
      body: {
        ...txToSend,
        signature: txToSendSignature,
        proxy: IdentityProxyAddress,
        preflight: false
      }
    })
    const response = mockResponse()

    await relayer.relay(request, response)

    assert(response.statusCode === 200, `response code is ${response.statusCode}`)
    assert(!response.body.errors, 'errors in response')
    assert(response.body.id, 'missing txhash')

    const proxyReceipt = await web3.eth.getTransactionReceipt(response.body.id)
    assert(proxyReceipt.status)

    // Verify the expected events are in the receipt
    assert(eventSigInReceipt(proxyReceipt, EVENT_SIG_IDENTITYUPDATED), 'missing IdentityUpdated event')
    assert(!eventSigInReceipt(proxyReceipt, EVENT_SIG_PROXYCREATION), 'ProxyCreation event found')

    await relayer.purse.teardown(true) // Testing cleanup only
  })

  // TODO: This is perhaps temporary behavior
  it('prevents multiple transactions to the same proxy', async () => {
    const relayer = new Relayer(netId)

    assert(IdentityProxyAddress, 'IdentityProxy address missing')

    // Don't want the tx to leave pending too quick
    await stopMining(web3)

    // Using IdentityEvents for testing because of its simplicity
    const txData = IdentityEvents.methods.emitIdentityUpdated(JUNK_HASH).encodeABI()

    const Proxy = new web3.eth.Contract(IdentityProxyBuild.abi, IdentityProxyAddress)
    const proxyNonce = await Proxy.methods.nonce(Rando).call()

    const txToSend = {
      from: Rando,
      to: IdentityEventsAddress,
      txData: txData,
      nonce: proxyNonce
    }
    const txDatahash = hashTxdata(web3, txToSend)
    const txToSendSignature = await web3.eth.sign(txDatahash, Rando)

    const request = mockRequest({
      headers: { 'x-real-ip': '98.210.130.145' },
      body: {
        ...txToSend,
        signature: txToSendSignature,
        proxy: IdentityProxyAddress,
        preflight: false
      }
    })
    const response = mockResponse()

    await relayer.relay(request, response)

    assert(response.statusCode === 200, `response code is ${response.statusCode}`)
    assert(!response.body.errors, 'errors in response')
    assert(response.body.id, 'missing txhash')

    const request2 = mockRequest({
      headers: { 'x-real-ip': '98.210.130.145' },
      body: {
        ...txToSend,
        signature: txToSendSignature,
        proxy: IdentityProxyAddress,
        preflight: false
      }
    })
    const response2 = mockResponse()

    await relayer.relay(request2, response2)

    assert(response2.statusCode === 429, `response2 code should be 429, is ${response.statusCode}`)

    // Continue again
    await startMining(web3)

    const proxyReceipt = await web3.eth.getTransactionReceipt(response.body.id)
    assert(proxyReceipt.status)

    await relayer.purse.teardown(true) // Testing cleanup only
  })

  it('prevents multiple proxy creation transactions', async () => {
    const relayer = new Relayer(netId)

    // Don't want the tx to leave pending too quick
    await stopMining(web3)

    // Using IdentityEvents for testing because of its simplicity
    const txData = IdentityEvents.methods.emitIdentityUpdated(JUNK_HASH).encodeABI()

    // The proxied call
    const Proxy = new web3.eth.Contract(IdentityProxyBuild.abi)
    const proxyTxData = await Proxy.methods
      .changeOwnerAndExecute(Rando, IdentityEventsAddress, '0', txData)
      .encodeABI()

    // The create proxy call
    const createCallTxData = await ProxyFactory.methods.createProxyWithSenderNonce(IdentityProxyMaster, proxyTxData, Rando, '0').encodeABI()

    const txToSend = {
      from: Joe,
      to: ProxyFactoryAddress,
      txData: createCallTxData,
      nonce: 0
    }
    const txDatahash = hashTxdata(web3, txToSend)
    const txToSendSignature = await web3.eth.sign(txDatahash, Joe)

    const request = mockRequest({
      headers: { 'x-real-ip': '98.210.130.145' },
      body: {
        ...txToSend,
        signature: txToSendSignature,
        preflight: false
      }
    })
    const response = mockResponse()

    await relayer.relay(request, response)

    assert(response.statusCode === 200, `response code is ${response.statusCode}`)
    assert(!response.body.errors, 'errors in response')
    assert(response.body.id, 'missing txhash')

    const request2 = mockRequest({
      headers: { 'x-real-ip': '98.210.130.145' },
      body: {
        ...txToSend,
        signature: txToSendSignature,
        preflight: false
      }
    })
    const response2 = mockResponse()

    await relayer.relay(request2, response2)

    assert(response2.statusCode === 429, `response2 code should be 429, is ${response.statusCode}`)

    // Continue again
    await startMining(web3)

    const proxyReceipt = await web3.eth.getTransactionReceipt(response.body.id)
    assert(proxyReceipt.status)

    await relayer.purse.teardown(true) // Testing cleanup only
  })
})
