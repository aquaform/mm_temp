import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Получение __dirname в ES-модуле ---
const __filename = fileURLToPath(import.meta.url); // Получаем полный путь к текущему файлу
const __dirname = path.dirname(__filename);      // Получаем директорию, где находится файл
// ----------------------------------------

const app = express();
const PORT = 8080;

const projectRoot = __dirname; // Теперь __dirname определен правильно

console.log(`Serving static files from: ${projectRoot}`);

app.use(express.static(projectRoot));

app.listen(PORT, () => {
    console.log(`Express server running at http://localhost:${PORT}/`);
    console.log(`You can also try http://127.0.0.1:${PORT}/`);
}); 