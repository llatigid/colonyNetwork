/* globals artifacts */
import sha3 from 'solidity-sha3';
import testHelper from '../helpers/test-helper';

const EtherRouter = artifacts.require('EtherRouter');
const Resolver = artifacts.require('Resolver');
const ColonyNetwork = artifacts.require('ColonyNetwork');
const Colony = artifacts.require('Colony');
const Token = artifacts.require('Token');
const Authority = artifacts.require('Authority');

const ipfsDecodedHash = '9bb76d8e6c89b524d34a454b3140df28';

contract('Colony', function (accounts) {
  let COLONY_KEY;
  const MAIN_ACCOUNT = accounts[0];
  const OTHER_ACCOUNT = accounts[1];
  const THIRD_ACCOUNT = accounts[2];
  // This value must be high enough to certify that the failure was not due to the amount of gas but due to a exception being thrown
  const GAS_TO_SPEND = 4700000;

  const optionsToSpotTransactionFailure = {
    from: MAIN_ACCOUNT,
    gas: GAS_TO_SPEND,
  };

  let colony;
  let token;
  let authority;
  let colonyNetwork;

  before(async function () {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await ColonyNetwork.at(etherRouter.address);
    await colonyNetwork.createColony("Common Colony");
  });

  beforeEach(async function () {
    COLONY_KEY = testHelper.getRandomString(7);
    await colonyNetwork.createColony(COLONY_KEY);
    let address = await colonyNetwork.getColony.call(COLONY_KEY);
    colony = await Colony.at(address);
    let authorityAddress = await colony.authority.call();
    authority = await Authority.at(authorityAddress);
    let tokenAddress = await colony.token.call();
    token = await Token.at(tokenAddress);
  });

  describe('when receiving tokens', () => {
    it('should not put the tokens straight in to the pot', async function () {
      let otherToken = await Token.new();
      await otherToken.mint(100)
      await otherToken.transfer(colony.address, 100)
      let colonyRewardPotBalance= await colony.getPotBalance.call(0,otherToken.address);
      let colonyPotBalance= await colony.getPotBalance.call(1,otherToken.address);
      let colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100)
      assert.equal(colonyPotBalance.toNumber(), 0);
      assert.equal(colonyRewardPotBalance.toNumber(), 0);
      await colony.claimColonyFunds(otherToken.address);
      colonyRewardPotBalance= await colony.getPotBalance.call(0,otherToken.address);
      colonyPotBalance= await colony.getPotBalance.call(1,otherToken.address);
      colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100)
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(colonyRewardPotBalance.toNumber(), 1);
    });

    it('should not put its own tokens in to the reward pot', async function () {
      await colony.mintTokens(100);
      let colonyRewardPotBalance= await colony.getPotBalance.call(0,token.address);
      let colonyPotBalance= await colony.getPotBalance.call(1,token.address);
      let colonyTokenBalance = await token.balanceOf.call(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100)
      assert.equal(colonyPotBalance.toNumber(), 0);
      assert.equal(colonyRewardPotBalance.toNumber(), 0);
      await colony.claimColonyFunds(token.address);
      colonyRewardPotBalance= await colony.getPotBalance.call(0,token.address);
      colonyPotBalance= await colony.getPotBalance.call(1,token.address);
      colonyTokenBalance = await token.balanceOf.call(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 100)
      assert.equal(colonyPotBalance.toNumber(), 100);
      assert.equal(colonyRewardPotBalance.toNumber(), 0);
    });

    it('should let tokens be moved between pots', async function () {
      let otherToken = await Token.new();
      await otherToken.mint(100)
      await otherToken.transfer(colony.address, 100)
      await colony.claimColonyFunds(otherToken.address);
      await colony.makeTask(ipfsDecodedHash);
      await colony.moveFundsBetweenPots(1,2,51,otherToken.address);
      let colonyPotBalance= await colony.getPotBalance.call(1,otherToken.address);
      let colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      let pot2Balance= await colony.getPotBalance.call(2,otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100)
      assert.equal(colonyPotBalance.toNumber(), 48);
      assert.equal(pot2Balance.toNumber(), 51);
    });

    it('should not let tokens be moved from the pot for payouts to token holders', async function () {
      let otherToken = await Token.new();
      await otherToken.mint(100)
      await otherToken.transfer(colony.address, 100)
      await colony.claimColonyFunds(otherToken.address);
      await colony.makeTask(ipfsDecodedHash);
      try {
        await colony.moveFundsBetweenPots(0,2,1,otherToken.address);
      } catch(err) {
      }
      let colonyPotBalance= await colony.getPotBalance.call(1,otherToken.address);
      let colonyRewardPotBalance= await colony.getPotBalance.call(0,otherToken.address);
      let colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      let pot2Balance= await colony.getPotBalance.call(2,otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100)
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(pot2Balance.toNumber(), 0);
      assert.equal(colonyRewardPotBalance.toNumber(), 1);
    });

    it('should not let tokens be moved by non-admins', async function () {
      let otherToken = await Token.new();
      await otherToken.mint(100)
      await otherToken.transfer(colony.address, 100)
      await colony.claimColonyFunds(otherToken.address);
      await colony.makeTask(ipfsDecodedHash);
      try {
        await colony.moveFundsBetweenPots(1,2,51,otherToken.address, {from: addresses[1]});
      } catch (err) {
      }
      let colonyPotBalance= await colony.getPotBalance.call(1,otherToken.address);
      let colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      let pot2Balance= await colony.getPotBalance.call(2,otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100)
      assert.equal(colonyPotBalance.toNumber(), 99);
      assert.equal(pot2Balance.toNumber(), 0);
    });

    it('should not allow more tokens to leave a pot than the pot has (even if the colony has that many)', async function () {
      let otherToken = await Token.new();
      await otherToken.mint(100)
      await otherToken.transfer(colony.address, 100)
      await colony.claimColonyFunds(otherToken.address);
      await colony.makeTask(ipfsDecodedHash);
      await colony.makeTask(ipfsDecodedHash);
      await colony.moveFundsBetweenPots(1,2,40,otherToken.address);
      let tx;
      try {
        tx = await colony.moveFundsBetweenPots(2,3,50,otherToken.address);
      } catch(err) {
        tx = await testHelper.ifUsingTestRPC(err);
      }
      let colonyPotBalance= await colony.getPotBalance.call(1,otherToken.address);
      let colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      let pot2Balance= await colony.getPotBalance.call(2,otherToken.address);
      let pot3Balance= await colony.getPotBalance.call(3,otherToken.address);
      assert.equal(colonyTokenBalance.toNumber(), 100)
      assert.equal(colonyPotBalance.toNumber(), 59);
      assert.equal(pot2Balance.toNumber(), 40);
      assert.equal(pot3Balance.toNumber(), 0);
    });

    it('should correctly track if we are able to make token payouts', async function(){
      // There are twelve scenarios to test here.
      // Pot was below payout, now equal (1 + 2)
      // Pot was below payout, now above (3 + 4)
      // Pot was equal to payout, now above (5 + 6)
      // Pot was equal to payout, now below (7 + 8)
      // Pot was above payout, now below (9 + 10)
      // Pot was above payout, now equal (11 + 12)
      //
      // And, for each of these, we have to check that the update is correctly tracked when
      // the pot changes (odd numbers), and when the payout changes (even numbers)
      //
      // NB We do not need to be this exhaustive when using ether, because this test is testing
      // that updateTaskPayoutsWeCannotMakeAfterPotChange and updateTaskPayoutsWeCannotMakeAfterBudgetChange
      // are correct, which are used in both cases.
      let otherToken = await Token.new();
      await otherToken.mint(100)
      await otherToken.transfer(colony.address, 100)
      await colony.claimColonyFunds(otherToken.address);
      await colony.makeTask(ipfsDecodedHash);
      // Pot was equal to payout, transition to pot being lower by increasing payout (8)
      await colony.setTaskPayout(1,0,otherToken.address,40);
      let task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 1);
      // Pot was below payout, transition to being equal by increasing pot (1)
      await colony.moveFundsBetweenPots(1,2,40,otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 0);
      // Pot was equal to payout, transition to being above by increasing pot (5)
      await colony.moveFundsBetweenPots(1,2,40,otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 0);
      // Pot was above payout, transition to being equal by increasing payout (12)
      await colony.setTaskPayout(1,0,otherToken.address,80);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 0);
      // Pot was equal to payout, transition to being above by decreasing payout (6)
      await colony.setTaskPayout(1,0,otherToken.address,40);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 0);
      // Pot was above payout, transition to being equal by decreasing pot (11)
      await colony.moveFundsBetweenPots(2,1,40,otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 0);
      // Pot was equal to payout, transition to pot being below payout by changing pot (7)
      await colony.moveFundsBetweenPots(2,1,20,otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 1);
      // Pot was below payout, change to being above by changing pot (3)
      await colony.moveFundsBetweenPots(1,2,60,otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 0);
      // Pot was above payout, change to being below by changing pot (9)
      await colony.moveFundsBetweenPots(2,1,60,otherToken.address);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 1);
      // Pot was below payout, change to being above by changing payout (4)
      await colony.setTaskPayout(1,0,otherToken.address,10);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 0);
      // Pot was above payout, change to being below by changing payout (10)
      await colony.setTaskPayout(1,0,otherToken.address,40);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 1);
      // Pot was below payout, change to being equal by changing payout (2)
      await colony.setTaskPayout(1,0,otherToken.address,20);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 0);
    });

    it('should pay fees on revenue correctly', async function () {
      let otherToken = await Token.new();
      await otherToken.mint(100)
      await otherToken.transfer(colony.address, 100)
      await colony.claimColonyFunds(otherToken.address);
      await otherToken.mint(200)
      await otherToken.transfer(colony.address, 200)
      await colony.claimColonyFunds(otherToken.address);
      let colonyPotBalance= await colony.getPotBalance.call(1,otherToken.address);
      let colonyRewardPotBalance= await colony.getPotBalance.call(0,otherToken.address);
      let colonyTokenBalance = await otherToken.balanceOf.call(colony.address);
      assert.equal(colonyTokenBalance.toNumber(), 300)
      assert.equal(colonyRewardPotBalance.toNumber(), 3);
      assert.equal(colonyPotBalance.toNumber(), 297);
    });

    it('should not allow contributions to nonexistent pots', async function(){
      let otherToken = await Token.new();
      await otherToken.mint(100)
      await otherToken.transfer(colony.address, 100)
      await colony.claimColonyFunds(otherToken.address);
      try {
        await colony.moveFundsBetweenPots(1,5,40,otherToken.address);
      } catch (err) {

      }
      let colonyPotBalance= await colony.getPotBalance.call(1,otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 99);
    });


    it('should not allow funds to be removed from a task with payouts to go', async function(){
      let otherToken = await Token.new();
      await otherToken.mint(100)
      await otherToken.transfer(colony.address, 100)
      await colony.claimColonyFunds(otherToken.address);
      await colony.makeTask(ipfsDecodedHash);
      await colony.moveFundsBetweenPots(1,2,60,otherToken.address);
      await colony.setTaskPayout(1,0,otherToken.address,50);
      await colony.acceptTask(1);
      try {
        await colony.moveFundsBetweenPots(2,1,40,otherToken.address);
      } catch(err) {
      }
      let colonyPotBalance= await colony.getPotBalance.call(2,otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 60);
    });

    it('should allow funds to be removed from a task if there are no more payouts of that token to be claimed', async function(){
      let otherToken = await Token.new();
      await otherToken.mint(100)
      await otherToken.transfer(colony.address, 100)
      await colony.claimColonyFunds(otherToken.address);
      await colony.makeTask(ipfsDecodedHash);
      await colony.moveFundsBetweenPots(1,2,40,otherToken.address);
      await colony.setTaskPayout(1,0,otherToken.address,30);
      await colony.acceptTask(1);
      await colony.claimPayout(1,0,otherToken.address);
      await colony.moveFundsBetweenPots(2,1,10,otherToken.address);
      let colonyPotBalance= await colony.getPotBalance.call(2,otherToken.address);
      assert.equal(colonyPotBalance.toNumber(), 0);
    });

  });

  describe('when receiving ether', () => {
    it('should not put the ether straight in to the pot', async function () {
      await colony.send(100);
      let colonyPotBalance= await colony.getPotBalance.call(1,0x0);
      let colonyEtherBalance = await testHelper.web3GetBalance(colony.address);
      let colonyRewardBalance = await colony.getPotBalance.call(0,0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100)
      assert.equal(colonyPotBalance.toNumber(), 0);
      await colony.claimColonyFunds(0x0);
      colonyPotBalance= await colony.getPotBalance.call(1,0x0);
      colonyEtherBalance = await testHelper.web3GetBalance(colony.address);
      colonyRewardBalance = await colony.getPotBalance.call(0,0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100)
      assert.equal(colonyRewardBalance.toNumber(), 1);
      assert.equal(colonyPotBalance.toNumber(), 99);
    });

    it('should let ether be moved between pots', async function () {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.makeTask(ipfsDecodedHash);
      await colony.moveFundsBetweenPots(1,2,51,0x0);
      let colonyPotBalance= await colony.getPotBalance.call(1,0x0);
      let colonyEtherBalance = await testHelper.web3GetBalance(colony.address);
      let pot2Balance= await colony.getPotBalance.call(2,0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100)
      assert.equal(colonyPotBalance.toNumber(), 48);
      assert.equal(pot2Balance.toNumber(), 51);
    });

    it('should not allow more ether to leave a pot than the pot has (even if the colony has that many)', async function () {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.makeTask(ipfsDecodedHash);
      await colony.makeTask(ipfsDecodedHash);
      await colony.moveFundsBetweenPots(1,2,40,0x0);
      let tx;
      try {
        tx = await colony.moveFundsBetweenPots(2,3,50,0x0);
      } catch(err) {
      }
      let colonyEtherBalance = await testHelper.web3GetBalance(colony.address);
      let colonyPotBalance= await colony.getPotBalance.call(1,0x0);
      let pot2Balance= await colony.getPotBalance.call(2,0x0);
      let pot3Balance= await colony.getPotBalance.call(3,0x0);
      assert.equal(colonyEtherBalance.toNumber(), 100)
      assert.equal(colonyPotBalance.toNumber(), 59);
      assert.equal(pot2Balance.toNumber(), 40);
      assert.equal(pot3Balance.toNumber(), 0);
    });

    it('should correctly track if we are able to make ether payouts', async function(){
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.makeTask(ipfsDecodedHash);
      await colony.setTaskPayout(1,0,0x0,40);
      let task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 1);
      await colony.moveFundsBetweenPots(1,2,40,0x0);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 0);
      await colony.moveFundsBetweenPots(2,1,30,0x0);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 1);
      await colony.setTaskPayout(1,0,0x0,10);
      task = await colony.getTask.call(1);
      assert.equal(task[4].toNumber(), 0);
    })

    it('should pay fees on revenue correctly', async function () {
      await colony.send(100);
      await colony.claimColonyFunds(0x0);
      await colony.send(200);
      await colony.claimColonyFunds(0x0);
      let colonyPotBalance= await colony.getPotBalance.call(1,0x0);
      let colonyRewardPotBalance= await colony.getPotBalance.call(0,0x0);
      let colonyEtherBalance = await testHelper.web3GetBalance(colony.address);
      assert.equal(colonyEtherBalance.toNumber(), 300)
      assert.equal(colonyPotBalance.toNumber(), 297);
      assert.equal(colonyRewardPotBalance.toNumber(), 3);
    });

  });

});