import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers.js";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("VentureFund", function () {
  async function deployVentureFundFixture() {
    const [
      owner, 
      tom, 
      ben, 
      rick, 
      jack, 
      startupA
    ] = await ethers.getSigners();

    // Развертывание токенов
    const SystemToken = await ethers.getContractFactory("SystemToken");
    const daoMembers = [tom.address, ben.address, rick.address];
    const systemToken = await SystemToken.deploy(daoMembers);

    const WrapToken = await ethers.getContractFactory("WrapToken");
    const wrapToken = await WrapToken.deploy(owner.address);

    // Развертывание основного контракта
    const VentureFund = await ethers.getContractFactory("VentureFund");
    const ventureFund = await VentureFund.deploy(
      systemToken.target,
      wrapToken.target,
      tom.address,
      ben.address,
      rick.address
    );

    // Установка адреса VentureFund как владельца wrapToken
    await wrapToken.connect(owner).transferOwnership(ventureFund.target);

    return {
      ventureFund,
      systemToken,
      wrapToken,
      owner,
      tom,
      ben,
      rick,
      jack,
      startupA
    };
  }

  describe("Initialization", function () {
    it("Should initialize with correct DAO members", async function () {
      const { ventureFund, tom, ben, rick, jack } = await loadFixture(deployVentureFundFixture);
      
      expect(await ventureFund.isDaoMember(tom.address)).to.be.true;
      expect(await ventureFund.isDaoMember(ben.address)).to.be.true;
      expect(await ventureFund.isDaoMember(rick.address)).to.be.true;
      expect(await ventureFund.isDaoMember(jack.address)).to.be.false;
    });

    it("Should have correct token distributions", async function () {
      const { systemToken, tom, ben, rick } = await loadFixture(deployVentureFundFixture);
      
      // 100,000 PROFI разделены между 3 участниками DAO
      const totalSupply = await systemToken.totalSupply();
      const decimals = await systemToken.decimals();
      const expectedTotal = ethers.parseUnits("100000", decimals);
      
      expect(totalSupply).to.equal(expectedTotal);
      
      // Каждый участник должен иметь примерно 33,333 PROFI
      const tomBalance = await systemToken.balanceOf(tom.address);
      const benBalance = await systemToken.balanceOf(ben.address);
      const rickBalance = await systemToken.balanceOf(rick.address);
      
      // Проверяем приблизительное равенство (может быть небольшая погрешность из-за округления)
      const expectedBalance = expectedTotal / 3n;
      
      expect(tomBalance).to.be.closeTo(expectedBalance, 1n);
      expect(benBalance).to.be.closeTo(expectedBalance, 1n);
      expect(rickBalance).to.be.closeTo(expectedBalance, 1n);
    });
  });

  describe("Proposing and Voting", function () {
    it("Should allow DAO members to create proposals", async function () {
      const { ventureFund, tom, startupA } = await loadFixture(deployVentureFundFixture);
      
      // Tom создает предложение инвестировать в startupA
      const tx = await ventureFund.connect(tom).proposeBeforeVoting(
        0, // ProposalType.A - Инвестирование в новый стартап
        startupA.address,
        ethers.parseEther("10000"), // 10,000 ETH
        "invest",
        "Invest 10,000 ETH in Startup A"
      );
      
      // Получаем индекс предложения (всегда 0 для первого предложения)
      const unvotedProposalIndex = 0;
      
      // Проверяем, что предложение создано
      const proposal = await ventureFund.unvotedProposals(unvotedProposalIndex);
      expect(proposal.proposedBy).to.equal(tom.address);
      expect(proposal.target).to.equal(startupA.address);
    });

    it("Should allow DAO members to start voting", async function () {
      const { ventureFund, tom, startupA } = await loadFixture(deployVentureFundFixture);
      
      // Tom создает предложение
      await ventureFund.connect(tom).proposeBeforeVoting(
        0, // ProposalType.A - Инвестирование в новый стартап
        startupA.address,
        ethers.parseEther("10000"), // 10,000 ETH
        "invest",
        "Invest 10,000 ETH in Startup A"
      );
      
      // Tom запускает голосование
      const tx = await ventureFund.connect(tom).startVoting(
        0, // Индекс предложения
        5, // 5 минут голосования
        2, // QuorumMechanism.Weighted
        1 // Приоритет
      );
      
      // Получаем ID голосования
      const receipt = await tx.wait();
      const proposalId = await ventureFund.votedProposals(0);
      
      // Проверяем, что голосование создано
      expect(proposalId.proposedBy).to.equal(tom.address);
      expect(proposalId.votingStartedBy).to.equal(tom.address);
      expect(proposalId.quorumMechanism).to.equal(2); // Weighted
    });
  });

  describe("Token Delegation", function () {
    it("Should allow non-DAO members to delegate tokens", async function () {
      const { ventureFund, wrapToken, owner, jack, ben } = await loadFixture(deployVentureFundFixture);
      
      // Jack покупает wrap-токены
      const jackEthAmount = ethers.parseEther("10"); // 10 ETH
      await ventureFund.connect(jack).buyWrapToken({ value: jackEthAmount });
      
      // Проверяем баланс Jack после покупки
      const jackWrapBalance = await wrapToken.balanceOf(jack.address);
      expect(jackWrapBalance).to.be.greaterThan(0);
      
      // Jack делегирует токены Ben
      // Сначала нужно одобрение для DAO контракта
      await wrapToken.connect(jack).approve(ventureFund.target, jackWrapBalance);
      
      // Делегирование
      await ventureFund.connect(jack).delegateTokens(ben.address, jackWrapBalance);
      
      // Проверяем запись делегирования
      expect(await ventureFund.delegations(jack.address)).to.equal(ben.address);
      expect(await ventureFund.delegatedTokens(ben.address)).to.equal(jackWrapBalance);
    });
  });

  describe("Voting and Results", function () {
    it("Should count votes correctly with delegate tokens", async function () {
      const { ventureFund, systemToken, wrapToken, tom, ben, rick, jack, startupA } = await loadFixture(
        deployVentureFundFixture
      );
      
      // Jack покупает и делегирует токены Ben
      const jackEthAmount = ethers.parseEther("10"); // 10 ETH
      await ventureFund.connect(jack).buyWrapToken({ value: jackEthAmount });
      const jackWrapBalance = await wrapToken.balanceOf(jack.address);
      await wrapToken.connect(jack).approve(ventureFund.target, jackWrapBalance);
      await ventureFund.connect(jack).delegateTokens(ben.address, jackWrapBalance);
      
      // Tom создает предложение и запускает голосование
      await ventureFund.connect(tom).proposeBeforeVoting(
        0, // ProposalType.A - Инвестирование в новый стартап
        startupA.address,
        ethers.parseEther("10000"), // 10,000 ETH
        "invest",
        "Invest 10,000 ETH in Startup A"
      );
      
      const votingTx = await ventureFund.connect(tom).startVoting(
        0, // Индекс предложения
        5, // 5 минут голосования
        2, // QuorumMechanism.Weighted
        1 // Приоритет
      );
      
      // Получаем ID голосования
      const votingReceipt = await votingTx.wait();
      const proposalData = await ventureFund.votedProposals(0);
      const proposalId = proposalData.id;
      
      // Участники голосуют
      // Tom голосует "Да" с 120 токенами
      const tomVoteAmount = ethers.parseUnits("120", await systemToken.decimals());
      await systemToken.connect(tom).approve(ventureFund.target, tomVoteAmount);
      await ventureFund.connect(tom).castVote(proposalId, 1, tomVoteAmount); // 1 - "за"
      
      // Ben голосует "Да" с 90 токенами (+ учитываются делегированные от Jack)
      const benVoteAmount = ethers.parseUnits("90", await systemToken.decimals());
      await systemToken.connect(ben).approve(ventureFund.target, benVoteAmount);
      await ventureFund.connect(ben).castVote(proposalId, 1, benVoteAmount); // 1 - "за"
      
      // Rick голосует "Нет" с 60 токенами
      const rickVoteAmount = ethers.parseUnits("60", await systemToken.decimals());
      await systemToken.connect(rick).approve(ventureFund.target, rickVoteAmount);
      await ventureFund.connect(rick).castVote(proposalId, 0, rickVoteAmount); // 0 - "против"
      
      // Получаем результаты голосования
      const [forVotes, againstVotes, isSuccessful] = await ventureFund.getVotingResults(proposalId);
      
      // Проверяем результаты
      // Здесь учитываются делегированные токены для Ben!
      // Ожидаемый результат: forVotes > againstVotes (голосование успешно)
      expect(isSuccessful).to.be.true;
    });
  });
}); 