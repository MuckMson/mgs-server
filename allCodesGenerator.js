const fs = require('fs');

function generateAllCodes() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const codes = [];

    for (let i = 0; i < alphabet.length; i++) {
        for (let j = 0; j < alphabet.length; j++) {
            for (let k = 0; k < alphabet.length; k++) {
                for (let l = 0; l < alphabet.length; l++) {
                    codes.push(alphabet[i] + alphabet[j] + alphabet[k] + alphabet[l]);
                }
            }
        }
    }

    // Создаем JSON-объект
    const result = {
        rooms: codes.map(code => ({ code }))
    };

    // Сохраняем в файл
    fs.writeFileSync('allCodes.json', JSON.stringify(result, null, 2), 'utf8');
    console.log('Файл allCodes.json успешно создан!');
}

generateAllCodes();