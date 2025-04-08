    const fs = require('fs');
    const WebSocket = require('ws');

    const wsServer = new WebSocket.Server({ port: 8080 });

    const clients = [];



    class HostFunctions {
        handleHostMessage(message, ws) {
            const actionKey = Object.keys(message)[0]; // Получаем первый ключ из объекта message
        
            switch (actionKey) {
                case 'CREATE_ROOM':
                    this.createRoom(message, ws);
                    console.log('Запрос на создание комнаты.');
                    break;
                case 'PLAYER_REGISTER_RESULT':
                    this.playerRegister(message, ws);
                break;
        
                case 'FORWARD_TO_ALL_PLAYERS':
                    this.forwardToAllPlayers(message, ws);
                    break;
        
                default:
                    if( message.address != null){
                        console.log('Переслано сообщение от хоста ' + message.uid + ", игроку " + message.address);
                        this.forwardToPlayer(message, ws);
                    }
                    else{
                        console.error('Сообщение для пересылки не содержит адресата.');
                    }
                    break;
            }
        }
        
        async playerRegister(hostRequest, ws) {
            if (hostRequest.PLAYER_REGISTER_RESULT === 'success') {
                try {
                    console.log(`Попытка зарегистрировать игрока ${hostRequest.uid} в комнате ${hostRequest.roomCode}`);
                    
                    const fileData = await fs.promises.readFile('roomStorage.json', 'utf8');
                    const roomStorage = JSON.parse(fileData);
        
                    const room = roomStorage.rooms.find(r => r.code === hostRequest.roomCode);
                    if (!room) {
                        console.error(`Комната с кодом ${hostRequest.roomCode} не найдена.`);
                        return;
                    }
        
                    room.players.push({ name: hostRequest.name, uid: hostRequest.uid , pairedRoom: hostRequest.roomCode});
                    await fs.promises.writeFile('roomStorage.json', JSON.stringify(roomStorage, null, 2));
                    console.log(`Игрок ${hostRequest.name} успешно добавлен в комнату ${hostRequest.roomCode}.`);
                    
                    const sentResult = {
                        ROOM_JOINING_RESULT: "success",
                        takenSlot: hostRequest.slot
                    };
                    const addressingSocket = clients.find(item => item.uid === hostRequest.uid);
                    if(!addressingSocket){
                        console.error('Не удалось отправить результат входа: нет целевого подключения.');
                        return;
                    }
                    addressingSocket.connection.send(JSON.stringify(sentResult));
                    console.log('Разрешил игроку ' + hostRequest.uid + ' присоединиться!');
                } catch (error) {
                    console.error('Ошибка при обработке регистрации игрока:', error.message);
                }
            } else if (hostRequest.PLAYER_REGISTER_RESULT === 'failure') {
                console.log('Регистрация игрока не удалась.');
            } else {
                console.log('Неизвестный результат регистрации игрока.');
            }
        }

        createRoom(hostRequest, ws) {
            const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');

            const generateCode = () => {
                return Array(4)
                    .fill(null)
                    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
                    .join('');
            };

            const isUniqueCode = (code, roomData) =>
                !roomData.rooms.some(room => room.code === code);

            const roomData = this.getRoomStorageData();

            let roomCode;
            do {
                roomCode = generateCode();
            } while (!isUniqueCode(roomCode, roomData));

            const newRoom = {
                code: roomCode,
                players: [],
                host: hostRequest.uid,
                game: hostRequest.gameId
            };

            roomData.rooms.push(newRoom);

            fs.writeFileSync('./roomStorage.json', JSON.stringify(roomData, null, 2));

            const response = {
                ROOM_CREATION_RESULT: "true",
                roomCode: roomCode
            };

            ws.send(JSON.stringify(response));
            console.log("Комната создана с кодом:", roomCode);
        }

        forwardToAllPlayers(hostRequest, ws) {
            if (!hostRequest.roomCode) {
                console.error("В JSON нет кода комнаты.");
                ws.send(JSON.stringify({
                    requestType: 'FORWARD_TO_ALL_PLAYERS',
                    status: 'failed',
                    error: 'roomCode отсутствует'
                }));
                return;
            }
        
            let roomData;
            try {
                const roomFileContent = fs.readFileSync('roomStorage.json', 'utf8');
                roomData = JSON.parse(roomFileContent);
            } catch (err) {
                console.error("Ошибка чтения или парсинга roomStorage.json:", err);
                ws.send(JSON.stringify({
                    requestType: 'FORWARD_TO_ALL_PLAYERS',
                    status: 'failed',
                    error: 'Не удалось загрузить данные комнат'
                }));
                return;
            }
        
            if (!roomData.rooms || !Array.isArray(roomData.rooms)) {
                console.error("Некорректная структура roomStorage.json: поле 'rooms' отсутствует или не является массивом.");
                ws.send(JSON.stringify({
                    requestType: 'FORWARD_TO_ALL_PLAYERS',
                    status: 'failed',
                    error: 'Некорректная структура данных комнат'
                }));
                return;
            }
        
            const room = roomData.rooms.find(r => r.code === hostRequest.roomCode);
            if (!room) {
                console.error(`Нет комнаты с кодом ${hostRequest.roomCode}`);
                ws.send(JSON.stringify({
                    requestType: 'FORWARD_TO_ALL_PLAYERS',
                    status: 'failed',
                    error: 'Комната не найдена'
                }));
                return;
            }
        
            const playerUIDs = room.players.map(player => player.uid);
        
            playerUIDs.forEach(playerUID => {
                const clientConnection = clients.find(client => client.uid === playerUID);
        
                if (clientConnection && clientConnection.connection) {
                    try {
                        clientConnection.connection.send(JSON.stringify({
                            ...hostRequest,
                            uid: hostRequest.uid || "unknown",
                            address: playerUID
                        }));
                        console.log(`Сообщение отправлено игроку ${playerUID} от ${hostRequest.uid || "unknown"}.`);
                    } catch (err) {
                        console.error(`Ошибка отправки игроку ${playerUID}:`, err);
                    }
                } else {
                    console.warn(`Подключение для игрока ${playerUID} не найдено.`);
                }
            });
        }

        forwardToPlayer(hostRequest, ws){
            const addressingSocket = clients.find(item => item.uid === hostRequest.address);
           
            addressingSocket.connection.send(JSON.stringify(hostRequest));
            console.log('Сообщение хоста ' + hostRequest.uid + ' переслано ' + hostRequest.address);
        }

        getRoomStorageData() {
            try {
                const data = fs.readFileSync('./roomStorage.json', 'utf8');
                return JSON.parse(data);
            } catch (error) {
                console.error('Ошибка чтения roomStorage.json:', error);
                return { rooms: [] };
            }
        }
    }

    class PlayerFunctions {
        
        handlePlayerMessage(message, ws) {
            const actionKey = Object.keys(message)[0];
        
            switch (actionKey) {
                case 'GET_ROOM_INFO_PLAYER':
                    this.getRoomInfoFP(message, ws);
                    console.log('Запрос на получение данных о комнате.');
                    break;
        
                default:
                    this.forwardToHost(message, ws);
                    console.log("Не знаю что делать с этой херней, переслал хосту, пусть сам разбирается.");
                    break;
            }
        }

        forwardToHost(playerRequest, ws) {
            const roomStorage = JSON.parse(fs.readFileSync('./roomStorage.json', 'utf8'));
            const clientStorage = JSON.parse(fs.readFileSync('./clientStorage.json', 'utf8'));
            
            const uid = playerRequest.uid;
            let roomCode = playerRequest.roomCode;

            // Функция для получения pairedRoom по UID
            function getPairedRoomByUid(uidToCheck) {
                try {
                    for (const room of roomStorage.rooms) {
                        for (const player of room.players) {
                            if (player.uid === uidToCheck) {
                                return player.pairedRoom;
                            }
                        }
                    }
                    return null;
                } catch (error) {
                    console.error('Ошибка при чтении файла roomStorage.json:', error);
                    return null;
                }
            }
        
            // Если roomCode не передан, пытаемся найти его в clientStorage или через pairedRoom
            if (!roomCode) {
                const client = clientStorage.find(client => client.uid === uid);
                roomCode = client?.pairedRoom || getPairedRoomByUid(uid);
            }
        
            if (!roomCode) {
                console.warn("Код комнаты не определен: " + roomCode);
                ws.send(JSON.stringify({ error: "Room code is undefined" }));
                return;
            }
        
            // Ищем комнату по roomCode
            const room = roomStorage.rooms.find(room => room.code === roomCode);
            if (!room) {
                console.warn(`Комната с кодом ${roomCode} не найдена.`);
                ws.send(JSON.stringify({
                    RETURN_ROOM_INFO: "player",
                    gameID: "null",
                    status: "null",
                    supportAudience: false,
                    password: ""
                }));
                return;
            }
        
            console.log('Хост комнаты:', room.host);
        
            // Ищем хоста комнаты
            const host = clientStorage.find(client => client.uid === room.host && client.clientType === "host");
            const targetConnection = clients.find(item => item.uid === host?.uid);
        
            if (!host || !targetConnection || !targetConnection.connection) {
                console.warn(`Хост для комнаты ${roomCode} не найден или не подключен.`);
                ws.send(JSON.stringify({ error: "Host connection not found" }));
                return;
            }
        
            // Пересылаем запрос хосту
            targetConnection.connection.send(JSON.stringify(playerRequest));
            console.log(`Переслал сообщение в комнату ${roomCode} от ${uid} хосту ${host.uid}.`);
        }
        getRoomInfoFP(playerRequest, ws) {
            const roomStorage = JSON.parse(fs.readFileSync('./roomStorage.json'));
            const clientStorage = JSON.parse(fs.readFileSync('./clientStorage.json'));
        
            const roomCode = playerRequest.roomCode; // Используем roomCode из запроса игрока
            const uid = playerRequest.uid; // UID игрока из запроса
            const name = playerRequest.name || "defaultplayer"; // Имя игрока (по умолчанию "defaultplayer" если не указано)
        
            // Найти комнату по roomCode
            const room = roomStorage.rooms.find(room => room.code === roomCode);

            if (!room) {
                console.warn(`Комната с кодом ${roomCode} не найдена.`);
                ws.send(JSON.stringify({ RETURN_ROOM_INFO: "player", gameID: "null", status: "null", supportAudience: false, password: ""}));
                return;
            }
            console.log('Хост ' + roomCode + ' комнаты: ' + room.host);
            // Найти хоста по hostId в clientStorage.json
            // Здесь мы ищем хоста с типом "host", а не "player"
            const host = clientStorage.find(client => client.uid === room.host && client.clientType === "host");


            const targetConnection = clients.find(item => item.uid ===  host.uid)

            if (!host || !targetConnection.connection) {
                console.warn(`Хост для комнаты ${roomCode} не найден.`);
                ws.send(JSON.stringify({ error: "Host not found" }));
                return;
            }
            console.log("Host found:", host);
            // Переслать запрос хосту
            targetConnection.connection.send(JSON.stringify({
                PLAYER_GET_ROOM_INFO: "player",
                uid: uid,
                name: name,
                roomCode: roomCode
            }));
        
            console.log(`Запрос о комнате ${roomCode} от ${uid} переслан хосту ${host.uid}.`);
        }
    }

    const hostFunctions = new HostFunctions();
    const playerFunctions = new PlayerFunctions();

    // Сохраняем и получаем данные о клиентах
    const getClientStorageData = () => {
        try {
            const data = fs.readFileSync('./clientStorage.json', 'utf8');
            const parsedData = JSON.parse(data);
            // Проверка, чтобы данные были массивом
            if (Array.isArray(parsedData)) {
                return parsedData;
            } else {
                console.error('Неверный формат данных в clientStorage.json. Ожидался массив.');
                return []; // Возвращаем пустой массив, если данные невалидны
            }
        } catch (error) {
            console.error('Ошибка чтения clientStorage.json:', error);
            return []; // Если файла нет, возвращаем пустой массив
        }
    };

    const saveClientData = (data) => {
        try {
            fs.writeFileSync('./clientStorage.json', JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Ошибка сохранения данных в clientStorage.json:', error);
        }
    };

    

    wsServer.on('connection', (ws) => {
        console.log('Новое подключение клиента.');

        // Инициализация состояния клиента
        clients.push({ verified: false, connection: ws });

        var isWaiting = false;
        let uid = "";
        let clientType = "";

        // Шлем запрос на подтверждение клиента
        const confirmationMessage = {
        GET_CLIENT_DATA_REQUEST: "request"
        };
        ws.send(JSON.stringify(confirmationMessage));
        
            clients.push({ verified: false, connection: ws });
            ws.on('message', (message) => {
                try {
                    if (isWaiting) {
                        console.log('Запрос отклонен, ожидание...');
                        return;  // Если мы в ожидании, запрос не отправляется
                    }
                


                    const data = JSON.parse(message);

                    const client = clients.find(c => c.connection === ws); // Получаем объект клиента по подключению
                    
                    if (!client.verified) {
                        if (data.clientType && data.uid) {
                            console.log(`Клиент подключился. Тип: ${data.clientType}, UID: ${data.uid}`);

                            let playerJSON = {}; // Объявляем объект клиента
                            switch (data.clientType) {
                                case "host":
                                    playerJSON = {
                                        clientType: data.clientType,
                                        uid: data.uid
                                    };
                                    break;
                                case "player":
                                    playerJSON = {
                                        clientType: data.clientType,
                                        pairedRoom: "defaultroom0",
                                        uid: data.uid
                                    };
                                    break;
                            }

                            uid = data.uid;
                            clientType = data.clientType;

                            clients.push({uid: data.uid, connection: ws});
                            const clientData = getClientStorageData(); // Убедись, что функция доступна
                            clientData.push(playerJSON);
                            saveClientData(clientData);

                            ws.send(JSON.stringify({ CONNECTION_RESULT: true }));
                            client.verified = true; // Помечаем клиента как подтвержденного

                            console.log('Отправлено подтверждение подключения!');
                        } else {
                            console.error('От клиента получены некорректные данные.');
                            ws.close();
                        }
                    } else {
                        switch (clientType) {
                            case 'host':
                                hostFunctions.handleHostMessage(data, ws);
                                break;
                            case 'player':
                                playerFunctions.handlePlayerMessage(data, ws);
                                break;
                            default:
                                ws.close();
                                console.warn('Неизвестный тип клиента:', data.clientType);
                                break;
                        }
                    }
                } catch (err) {
                    console.error('Ошибка обработки сообщения:', err);
                    ws.close();
                }
            });
            ws.on('close', () => {
                console.log('Клиент отключился.');
        
                // Удаляем клиента из массива `clients`
                const index = clients.findIndex(c => c.connection === ws);
                if (index !== -1) {
                    const disconnectedClient = clients.splice(index, 1)[0];
        
                    if (disconnectedClient && disconnectedClient.uid) {
                        // Удаляем клиента из файла clientStorage.json
                        const clientData = getClientStorageData();
                        const updatedClientData = clientData.filter(c => c.uid !== disconnectedClient.uid);
                        saveClientData(updatedClientData);
        
                        console.log(`Клиент с UID ${disconnectedClient.uid} удален из clientStorage.json.`);
                    }
                }
            });
        });

    // Функция отправки данных игроку
    function sendToPlayer(uid, data) {
        const playerConnection = getPlayerConnectionByUID(uid);
        if (playerConnection) {
            playerConnection.send(JSON.stringify(data));
        } else {
            console.error(`Игрок с UID ${uid} не найден.`);
        }
    }

    // Получение соединения игрока по UID
    const getPlayerConnectionByUID = (uid) => {
        const clientData = getClientStorageData();
        const player = clientData.find(client => client.uid === uid);
        return player ? player.connection : null;
    };