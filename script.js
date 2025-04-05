// Используем относительный путь для импорта модуля из node_modules
// Браузер запросит у сервера /node_modules/ethers/dist/ethers.js
import { ethers } from '/node_modules/ethers/dist/ethers.js'; 

const connectButton = document.getElementById('connectButton');
const accountInfoDiv = document.getElementById('accountInfo');

async function connectWallet() {
    // --- НЕОБХОДИМО ОБЕРНУТЬ В TRY...CATCH для обработки ошибок --- 

    // Проверяем, установлен ли MetaMask (или совместимый провайдер)
    if (!window.ethereum) {
        alert('MetaMask не установлен!');
        return;
    }

    connectButton.disabled = true;
    connectButton.textContent = 'Подключаемся...';

    // Запрашиваем доступ к аккаунту
    await window.ethereum.request({ method: 'eth_requestAccounts' });

    // Инициализируем провайдер и подписывающего (signer)
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner(); 
    const address = signer.address; 

    // Получаем баланс
    const balanceWei = await provider.getBalance(address);
    const balanceEth = ethers.formatEther(balanceWei);

    // Отображаем информацию
    accountInfoDiv.innerHTML = 
        `Адрес: ${address}<br>
         Баланс: ${parseFloat(balanceEth).toFixed(4)} ETH`;
    
    connectButton.textContent = 'Подключено';
    // Оставляем кнопку отключенной после успешного подключения
}

connectButton.addEventListener('click', connectWallet); 