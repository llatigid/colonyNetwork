/* globals artifacts */
import testHelper from "../helpers/test-helper";

const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ERC20Extended = artifacts.require("ERC20Extended");
const TokenAuction = artifacts.require("TokenAuction");
const Token = artifacts.require("Token");

contract("ColonyNetworkAuction", () => {
  let commonColony;
  let colonyNetwork;
  let tokenAuction;
  let clny;
  let token;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const commonColonyAddress = await colonyNetwork.getColony("Common Colony");
    commonColony = IColony.at(commonColonyAddress);
    const clnyAddress = await commonColony.getToken.call();
    clny = ERC20Extended.at(clnyAddress);
    const otherTokenArgs = testHelper.getTokenArgs();
    token = await Token.new(...otherTokenArgs);
    await token.mint(5e18);
    await token.transfer(colonyNetwork.address, 3e18);
  });

  beforeEach(async () => {
    const { logs } = await colonyNetwork.startTokenAuction(token.address, 3e18);
    const auctionAddress = logs[0].args.auction;
    tokenAuction = await TokenAuction.at(auctionAddress);
  });

  describe("when starting an auction", async () => {
    it("should log an 'AuctionCreated' event", async () => {
      await testHelper.expectEvent(colonyNetwork.startTokenAuction(token.address, 3e18), "AuctionCreated");
    });

    it("should initialise auction with correct CLNY token address", async () => {
      const clnyAddress = await tokenAuction.clny.call();
      assert.equal(clnyAddress, clny.address);
    });

    it("should initialise auction with correct token", async () => {
      const tokenAddress = await tokenAuction.token.call();
      assert.equal(tokenAddress, token.address);
    });

    it("should initialise auction with correct token quantity", async () => {
      const quantity = await tokenAuction.quantity.call();
      assert.equal(quantity, 3e18);
    });

    it("should initialise auction with correct start time", async () => {
      const currentTime = await testHelper.currentBlockTime();
      const startTime = await tokenAuction.startTime.call();
      assert.closeTo(startTime.toNumber(), currentTime, 2);
    });
  });
});
