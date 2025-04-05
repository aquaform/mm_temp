import { ethers } from "hardhat";

async function main() {
  console.log("Начинаем развертывание контрактов венчурного фонда...");

  // Получаем список адресов
  const [owner, tom, ben, rick, jack, startupA] = await ethers.getSigners();
  
  console.log("Развертывание выполняется с аккаунта:", owner.address);
  
  // Вывод информации об участниках системы
  console.log("\nУчастники системы:");
  console.log(`Tom (участник DAO): ${tom.address}`);
  console.log(`Ben (участник DAO): ${ben.address}`);
  console.log(`Rick (участник DAO): ${rick.address}`);
  console.log(`Jack (не участник DAO): ${jack.address}`);
  console.log(`Startup A: ${startupA.address}`);
  
  // Развертывание SystemToken (PROFI)
  console.log("\nРазвертывание SystemToken (PROFI)...");
  const SystemToken = await ethers.getContractFactory("SystemToken");
  const daoMembers = [tom.address, ben.address, rick.address];
  const systemToken = await SystemToken.deploy(daoMembers);
  await systemToken.waitForDeployment();
  console.log(`SystemToken развернут по адресу: ${systemToken.target}`);
  
  // Развертывание WrapToken (RTK)
  console.log("\nРазвертывание WrapToken (RTK)...");
  const WrapToken = await ethers.getContractFactory("WrapToken");
  const wrapToken = await WrapToken.deploy(owner.address);
  await wrapToken.waitForDeployment();
  console.log(`WrapToken развернут по адресу: ${wrapToken.target}`);
  
  // Развертывание VentureFund (основной контракт DAO)
  console.log("\nРазвертывание VentureFund...");
  const VentureFund = await ethers.getContractFactory("VentureFund");
  const ventureFund = await VentureFund.deploy(
    systemToken.target,
    wrapToken.target,
    tom.address,
    ben.address,
    rick.address
  );
  await ventureFund.waitForDeployment();
  console.log(`VentureFund развернут по адресу: ${ventureFund.target}`);
  
  // Передача владения WrapToken контракту VentureFund
  console.log("\nПередача владения WrapToken контракту VentureFund...");
  await wrapToken.transferOwnership(ventureFund.target);
  console.log("Владение WrapToken передано успешно");
  
  // Вывод информации о балансах токенов участников DAO
  console.log("\nБалансы токенов участников DAO:");
  const decimals = await systemToken.decimals();
  const tomBalance = await systemToken.balanceOf(tom.address);
  const benBalance = await systemToken.balanceOf(ben.address);
  const rickBalance = await systemToken.balanceOf(rick.address);
  
  console.log(`Tom: ${ethers.formatUnits(tomBalance, decimals)} PROFI`);
  console.log(`Ben: ${ethers.formatUnits(benBalance, decimals)} PROFI`);
  console.log(`Rick: ${ethers.formatUnits(rickBalance, decimals)} PROFI`);
  
  // ДЕМОНСТРАЦИЯ: Tom создаёт propose на 10,000 ETH в Startup A
  console.log("\n--- ДЕМОНСТРАЦИЯ СЦЕНАРИЯ ---");
  console.log("\n1. Tom создаёт предложение на инвестирование 10,000 ETH в Startup A");
  
  const proposeTransaction = await ventureFund.connect(tom).proposeBeforeVoting(
    0, // ProposalType.A - Инвестирование в новый стартап
    startupA.address,
    ethers.parseEther("10000"), // 10,000 ETH
    "invest",
    "Инвестировать 10,000 ETH в Startup A"
  );
  await proposeTransaction.wait();
  console.log("Предложение создано успешно");
  
  // Tom запускает голосование
  console.log("\n2. Tom запускает голосование на 5 минут");
  const votingTransaction = await ventureFund.connect(tom).startVoting(
    0, // Индекс предложения (первое предложение)
    5, // 5 минут голосования
    2, // QuorumMechanism.Weighted
    1 // Приоритет
  );
  
  const votingReceipt = await votingTransaction.wait();
  // Получаем ID предложения
  const proposalData = await ventureFund.votedProposals(0);
  const proposalId = proposalData.id;
  console.log(`Голосование запущено, ID предложения: ${proposalId}`);
  
  // Jack покупает wrap-токены и делегирует их Ben
  console.log("\n3. Jack покупает wrap-токены и делегирует их Ben");
  const jackEthAmount = ethers.parseEther("10"); // 10 ETH
  await ventureFund.connect(jack).buyWrapToken({ value: jackEthAmount });
  
  const jackWrapBalance = await wrapToken.balanceOf(jack.address);
  console.log(`Jack купил ${ethers.formatUnits(jackWrapBalance, await wrapToken.decimals())} RTK`);
  
  // Jack делегирует токены Ben
  await wrapToken.connect(jack).approve(ventureFund.target, jackWrapBalance);
  await ventureFund.connect(jack).delegateTokens(ben.address, jackWrapBalance);
  console.log(`Jack делегировал токены Ben`);
  
  // Ben голосует "Да" 90 токенов
  console.log("\n4. Ben голосует 'Да' 90 токенов");
  const benVoteAmount = ethers.parseUnits("90", decimals);
  await systemToken.connect(ben).approve(ventureFund.target, benVoteAmount);
  await ventureFund.connect(ben).castVote(proposalId, 1, benVoteAmount); // 1 - "за"
  console.log("Ben проголосовал успешно");
  
  // Rick голосует "Нет" 60 токенов
  console.log("\n5. Rick голосует 'Нет' 60 токенов");
  const rickVoteAmount = ethers.parseUnits("60", decimals);
  await systemToken.connect(rick).approve(ventureFund.target, rickVoteAmount);
  await ventureFund.connect(rick).castVote(proposalId, 0, rickVoteAmount); // 0 - "против"
  console.log("Rick проголосовал успешно");
  
  // Tom голосует "Да" 120 токенов
  console.log("\n6. Tom голосует 'Да' 120 токенов");
  const tomVoteAmount = ethers.parseUnits("120", decimals);
  await systemToken.connect(tom).approve(ventureFund.target, tomVoteAmount);
  await ventureFund.connect(tom).castVote(proposalId, 1, tomVoteAmount); // 1 - "за"
  console.log("Tom проголосовал успешно");
  
  // Получаем текущие результаты голосования
  console.log("\n7. Получаем текущие результаты голосования");
  const [forVotes, againstVotes, isSuccessful] = await ventureFund.getVotingResults(proposalId);
  console.log(`Голоса 'За': ${forVotes}`);
  console.log(`Голоса 'Против': ${againstVotes}`);
  console.log(`Голосование успешно: ${isSuccessful}`);
  
  console.log("\nДемонстрация завершена успешно!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 