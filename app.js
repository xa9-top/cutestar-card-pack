// 初始化IndexedDB
const dbName = 'StarMoeWallet';
const dbVersion = 1;

// 打开或创建数据库
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('events')) {
                db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('tickets')) {
                const ticketsStore = db.createObjectStore('tickets', { keyPath: 'id', autoIncrement: true });
                ticketsStore.createIndex('eventId', 'eventId', { unique: false });
            }
        };
        
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
        
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// 页面加载时初始化
window.addEventListener('DOMContentLoaded', async () => {
    try {
        window.db = await openDB();
        console.log('数据库已打开', window.db);
        
        // 初始化UI
        await initUI(window.db);
    } catch (error) {
        console.error('数据库打开失败:', error);
    }
});

// 显示空状态
function showEmptyState() {
    const cardsContainer = document.getElementById('cards-container');
    cardsContainer.innerHTML = `
        <div style="
            text-align: center;
            padding: 40px 20px;
            color: #666;
            font-size: 16px;
            cursor: pointer;
            "
            onclick="showAddEventDialog()">
            <mdui-icon name="add" style="font-size: 48px; margin-bottom: 16px;"></mdui-icon>
            <div>点击+添加活动</div>
        </div>
    `;
}

// 初始化UI
async function initUI(db) {
    // 获取活动列表
    const events = await getAllEvents(db);
    const eventSelect = document.getElementById('event-select');
    const deleteEventButton = document.getElementById('delete-event');
    const addEventButton = document.getElementById('add-event');

    addEventButton.onclick = function(e){
        e.stopPropagation();
        console.log("add event");
        showAddEventDialog();
    };

    deleteEventButton.onclick = function(e){
        e.stopPropagation();
        console.log("clear event");
        mdui.confirm({
            headline: "删除活动",
            description: "确定要删除当前活动及其所有关联票卡吗？",
            confirmText: "确定",
            cancelText: "取消",
            onConfirm: () => deleteEvent(db, eventSelect.value)
                .then(() => location.reload()),
        });
    };
    
    // 清空并填充活动下拉列表
    events.forEach(event => {
        const option = document.createElement('mdui-menu-item');
        option.value = event.id;
        option.textContent = event.name;
        eventSelect.appendChild(option);
    });

    // 自动选择最新活动
    if (events.length > 0) {
      const latestEvent = events.reduce((a, b) => a.id > b.id ? a : b);
      eventSelect.value = latestEvent.id;
      eventSelect.dispatchEvent(new Event('change'));
    }

    // 监听活动选择变化
    eventSelect.addEventListener('change', () => {
        const selectedEventId = eventSelect.value;
        if (selectedEventId) {
            loadTicketsForEvent(db, selectedEventId);
        } else {
            showEmptyState();
        }
    });

    // 初始化空状态检测
    if (events.length === 0) {
        showEmptyState();
    }
}

// 获取指定ID的活动
function getEventById(db, eventId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('events', 'readonly');
        const store = transaction.objectStore('events');
        const request = store.get(Number(eventId));
        
        request.onsuccess = () => {
            resolve(request.result);
        };
        
        request.onerror = () => {
            reject(request.error);
        };
    });
}

// 获取所有活动
function getAllEvents(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('events', 'readonly');
        const store = transaction.objectStore('events');
        const request = store.getAll();
        
        request.onsuccess = () => {
            resolve(request.result);
        };
        
        request.onerror = () => {
            reject(request.error);
        };
    });
}


// 显示添加活动对话框
function showAddEventDialog() {
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '1000',
        backgroundColor: 'rgba(0,0,0,0.5)' // ✅ 移除 !important
    });

    dialog.innerHTML = `
      <mdui-card style="padding:20px; width:80%; border-radius:5px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 0 8px;">
          <h2 style="margin:0; font-size: 1.25rem;">添加活动</h2>
          <mdui-button-icon
            icon="close"
            variant="standard"
            style="--mdui-icon-size: 24px; margin-right: -8px;"
            onclick="document.body.removeChild(this.parentElement.parentElement.parentElement)">
          </mdui-button-icon>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <mdui-button
            variant="filled"
            onclick="document.body.removeChild(this.parentElement.parentElement.parentElement); scanEventQRCode()">
              扫描活动二维码
              <mdui-icon slot="icon" name="qr_code_scanner"></mdui-icon>
          </mdui-button>
          <mdui-button
            variant="tonal"
            onclick="document.body.removeChild(this.parentElement.parentElement.parentElement); showManualEventInput()">
              手动输入
              <mdui-icon slot="icon" name="create"></mdui-icon>
          </mdui-button>
        </div>
      </mdui-card>
    `;

    document.body.appendChild(dialog);
}

// 加载指定活动的票卡
function loadTicketsForEvent(db, eventId) {
    const cardsContainer = document.getElementById('cards-container');
    
    if (!eventId) {
        showEmptyState();
        return;
    }

    getTicketsByEventId(db, eventId).then(tickets => {
        cardsContainer.innerHTML = '';
        
        if (tickets.length === 0) {
            cardsContainer.innerHTML = `
                <div style="text-align:center; color:#666; padding:20px;">
                    该活动暂无票卡，点击下方+添加
                </div>
            `;
        }
        
        // 显示票卡列表
        tickets.forEach(ticket => {
            const card = document.createElement('mdui-card');
            card.className = 'ticket-card';
            card.style.margin = '10px auto';
            card.style.width = '90%';
            card.style.padding = '16px';
            card.style.position = 'relative';
            
            card.style.borderRadius = '8px';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'center';
            card.setAttribute('onclick', `showTicketDetail('${ticket.ticket_name}', '${ticket.ticket_number}', '${ticket.ticket_state}', '${ticket.ticket_data}', '${ticket.entry_time}')`);
            
            const contentWrapper = document.createElement('div');
            contentWrapper.style.display = 'flex';
            contentWrapper.style.alignItems = 'center';
            contentWrapper.style.justifyContent = 'space-between';
            contentWrapper.style.width = '100%';
            
            const cardContent = document.createElement('div');
            cardContent.className = 'card-content';
            cardContent.style.fontSize = '16px';
            cardContent.style.textAlign = 'left';
            
            const ticketName = document.createElement('div');
            ticketName.textContent = ticket.ticket_name || ticket.ticket_data;
            ticketName.style.marginBottom = '4px';
            ticketName.style.fontWeight = 'bold';
            
            const ticketNumber = document.createElement('div');
            ticketNumber.textContent = ticket.ticket_number ? ticket.ticket_number : '';
            ticketNumber.style.fontSize = '14px';
            
            cardContent.appendChild(ticketName);
            cardContent.appendChild(ticketNumber);
            
            const deleteBtn = document.createElement('mdui-button');
            deleteBtn.innerHTML = '<mdui-icon slot="icon" name="delete_forever"></mdui-icon>删除';
            deleteBtn.setAttribute('variant', 'tonal');
            deleteBtn.setAttribute('onclick', `
                (function(e, id) {
                    e.stopPropagation();
                    handleDeleteTicket(id);
                })(event, ${ticket.id})
            `);
            contentWrapper.appendChild(cardContent);
            contentWrapper.appendChild(deleteBtn);
            card.appendChild(contentWrapper);
            cardsContainer.appendChild(card);
        });
        
        // 添加'添加票卡'卡片
        cardsContainer.innerHTML += `
          <mdui-card class="ticket-card" onclick="showAddTicketDialog(${eventId})" style="margin:10px auto; width:90%; padding:16px; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div style="display:flex; align-items:center; color:#666;">
              <mdui-icon name="add" style="margin-right:8px;"></mdui-icon>
              <span>添加票卡</span>
            </div>
          </mdui-card>
        `;
    });
}

// 扫描活动二维码
function scanEventQRCode() {
    const dialog = document.createElement('div');
    dialog.innerHTML = `
        <div style="background-color:rgba(0,0,0,0.5); position:fixed; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:1000; ">
            <mdui-card style="padding:20px; border-radius:5px; width:90%; max-width:500px;">
                <h2 style="margin-top:0;">扫描活动二维码</h2>
                <video style="width:100%; height:auto; border-radius:4px;"></video>
                <canvas style="display:none;"></canvas>
                <div class="scan-result" style="margin:10px 0; color:#666;"></div>
                <mdui-button variant="outlined" style="margin-top:15px;" class="close-btn">
                    关闭
                </mdui-button>
            </mdui-card>
        </div>
    `;

    const video = dialog.querySelector('video');
    const canvas = dialog.querySelector('canvas');
    const resultDiv = dialog.querySelector('.scan-result');
    
    dialog.querySelector('.close-btn').onclick = () => {
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        document.body.removeChild(dialog);
    };

    document.body.appendChild(dialog);

    // 启动摄像头扫描
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            video.srcObject = stream;
            video.play();
            requestAnimationFrame(tick);
        })
        .catch(error => {
            console.error('无法获取摄像头权限:', error);
            let errorMessage = '无法获取摄像头权限: ' + error.message;
            
            // 更详细的错误提示
            if (error.name === 'NotReadableError') {
                errorMessage = '摄像头可能被其他程序占用，请关闭其他使用摄像头的程序后重试';
            } else if (error.name === 'NotFoundError') {
                errorMessage = '未检测到可用的摄像头设备，请检查设备是否连接了摄像头';
            }
            
            resultDiv.innerHTML = '<div style="color:red;margin-bottom:10px;">' + errorMessage + '</div>'
        });
    
    function tick() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            const canvasContext = canvas.getContext('2d');
            canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, canvas.height, {
                inversionAttempts: 'dontInvert',
            });
            
            if (code) {
                resultDiv.textContent = '扫描结果: ' + code.data;
                handleScannedEventData(code.data);
                if (video.srcObject) {
                    video.srcObject.getTracks().forEach(track => track.stop());
                }
                document.body.removeChild(dialog);
            }
        }
        requestAnimationFrame(tick);
    }
}

// 显示手动输入活动对话框
function showManualEventInput() {
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
        backgroundColor: 'rgba(0,0,0,0.5)',
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '1000'
    });
    
    const content = document.createElement('mdui-card');
    content.style.padding = '20px';
    content.style.borderRadius = '5px';
    content.style.width = '90%';
    
    const title = document.createElement('h2');
    title.textContent = '手动输入活动信息';
    content.appendChild(title);
    
    const nameLabel = document.createElement('label');
    nameLabel.textContent = '活动名称:';
    content.appendChild(nameLabel);
    
    const nameInput = document.createElement('mdui-text-field');
    nameInput.type = 'text';
    nameInput.style.width = '100%';
    nameInput.style.marginBottom = '10px';
    content.appendChild(nameInput);
    
    const apiLabel = document.createElement('label');
    apiLabel.textContent = 'API地址:';
    content.appendChild(apiLabel);
    
    const apiInput = document.createElement('mdui-text-field');
    apiInput.type = 'text';
    apiInput.style.width = '100%';
    apiInput.style.marginBottom = '10px';
    content.appendChild(apiInput);
    
    const saveBtn = document.createElement('mdui-button');
    saveBtn.textContent = '保存';
    saveBtn.onclick = () => {
        const eventData = {
            name: nameInput.value,
            apiUrl: apiInput.value
        };
        handleScannedEventData(`${eventData.name}@${eventData.apiUrl}`);
        document.body.removeChild(dialog);
    };
    content.appendChild(saveBtn);
    
    const closeBtn = document.createElement('mdui-button');
    closeBtn.textContent = '关闭';
    closeBtn.setAttribute('variant', 'tonal');
    closeBtn.onclick = () => {
        document.body.removeChild(dialog);
    };
    closeBtn.style.marginLeft = '10px';
    content.appendChild(closeBtn);
    
    dialog.appendChild(content);
    document.body.appendChild(dialog);
}

// 获取指定活动的所有票卡
function getTicketsByEventId(db, eventId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('tickets', 'readonly');
        const store = transaction.objectStore('tickets');
        const index = store.index('eventId');
        const request = index.getAll(eventId);
        
        request.onsuccess = () => {
            resolve(request.result);
        };
        
        request.onerror = () => {
            reject(request.error);
        };
    });
}

// 删除票卡
function deleteTicket(db, ticketId) {
    const transaction = db.transaction('tickets', 'readwrite');
    const ticketsStore = transaction.objectStore('tickets');
    
    ticketsStore.delete(ticketId);
    
    transaction.oncomplete = () => {
        location.reload();
    };
    
    transaction.onerror = (error) => {
        console.error('删除票卡失败:', error);
        mdui.alert({
            headline: "提示",
            description: "删除票卡失败",
            confirmText: "确定",
        });
    };
}

// 显示添加票卡对话框
function showAddTicketDialog(eventId) {
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
        backgroundColor: 'rgba(0,0,0,0.5)',
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '1000'
    });    
    
    dialog.innerHTML = `
        <mdui-card style="padding:20px; width:80%; border-radius:5px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin:0">添加票卡</h2>
                <mdui-button-icon
                    icon="close"
                    variant="standard
                    "
                    onclick="document.body.removeChild(this.parentElement.parentElement.parentElement)">
                </mdui-button-icon>
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <mdui-button
                    variant="filled"
                    onclick="document.body.removeChild(this.parentElement.parentElement.parentElement); scanTicketQRCode(${eventId})">
                    扫描票卡二维码
                    <mdui-icon slot="icon" name="qr_code_scanner"></mdui-icon>
                </mdui-button>
                <mdui-button
                    variant="tonal"
                    onclick="document.body.removeChild(this.parentElement.parentElement.parentElement); showManualTicketInput(${eventId})">
                        手动输入
                    <mdui-icon slot="icon" name="create"></mdui-icon>
                </mdui-button>
            </div>
        </mdui-card>
    `;
    document.body.appendChild(dialog);
}

// 扫描票卡二维码
function scanTicketQRCode(eventId) {
    const dialog = document.createElement('div');
    dialog.innerHTML = `
        <div style="background-color:rgba(0,0,0,0.5); position:fixed; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:1000;">
            <mdui-card style="padding:20px; border-radius:5px; width:90%; max-width:500px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin-top:0;">扫描票卡二维码</h2>
                </div>
                <video style="width:100%; height:auto; border-radius:4px;"></video>
                <canvas style="display:none;"></canvas>
                <div class="scan-result" style="margin:10px 0; color:#666;"></div>
                <mdui-button 
                    variant="outlined" 
                    style="margin-top:15px;"
                    onclick="if (this.parentElement.querySelector('video').srcObject) {
                        this.parentElement.querySelector('video').srcObject.getTracks().forEach(track => track.stop());
                    }
                    document.body.removeChild(this.parentElement.parentElement.parentElement);">
                    关闭
                </mdui-button>
            </mdui-card>
        </div>
    `;

    const video = dialog.querySelector('video');
    const canvas = dialog.querySelector('canvas');
    const resultDiv = dialog.querySelector('.scan-result');
    document.body.appendChild(dialog);

    // 启动摄像头扫描
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            video.srcObject = stream;
            video.play();
            requestAnimationFrame(tick);
        })
        .catch(error => {
            console.error('无法获取摄像头权限:', error);
            let errorMessage = '无法获取摄像头权限: ' + error.message;
            
            if (error.name === 'NotReadableError') {
                errorMessage = '摄像头可能被其他程序占用，请关闭其他使用摄像头的程序后重试';
            } else if (error.name === 'NotFoundError') {
                errorMessage = '未检测到可用的摄像头设备，请检查设备是否连接了摄像头';
            }
            
            resultDiv.innerHTML = `
                <div style="color:red;margin-bottom:10px;">${errorMessage}</div>
            `;
        });

    function tick() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            const canvasContext = canvas.getContext('2d');
            canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, canvas.height, {
                inversionAttempts: 'dontInvert',
            });
            
            if (code) {
                resultDiv.textContent = '扫描结果: ' + code.data;
                handleScannedTicketData(code.data, eventId);
                if (video.srcObject) {
                    video.srcObject.getTracks().forEach(track => track.stop());
                }
                document.body.removeChild(dialog);
            }
        }
        requestAnimationFrame(tick);
    }
}

// 显示手动输入票卡对话框
function showManualTicketInput(eventId) {
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
        backgroundColor: 'rgba(0,0,0,0.5)',
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '1000'
    });
    
    const content = document.createElement('mdui-card');
    content.style.padding = '20px';
    content.style.borderRadius = '5px';
    content.style.width = '90%';
    
    const title = document.createElement('h2');
    title.textContent = '手动输入票卡信息';
    content.appendChild(title);
    
    const ticketLabel = document.createElement('label');
    ticketLabel.textContent = '票卡数据:';
    content.appendChild(ticketLabel);
    
    const ticketInput = document.createElement('mdui-text-field');
    ticketInput.type = 'text';
    ticketInput.style.width = '100%';
    ticketInput.style.marginBottom = '10px';
    content.appendChild(ticketInput);
    
    const saveBtn = document.createElement('mdui-button');
    saveBtn.textContent = '保存';
    saveBtn.onclick = () => {
        handleScannedTicketData(ticketInput.value, eventId);
        document.body.removeChild(dialog);
    };
    content.appendChild(saveBtn);
    
    const closeBtn = document.createElement('mdui-button');
    closeBtn.setAttribute('variant', 'tonal');
    closeBtn.textContent = '关闭';
    closeBtn.onclick = () => {
        document.body.removeChild(dialog);
    };
    closeBtn.style.marginLeft = '10px';
    content.appendChild(closeBtn);
    
    dialog.appendChild(content);
    document.body.appendChild(dialog);
}

// 处理扫描到的票卡数据
function handleScannedTicketData(ticketData, eventId) {
    openDB().then(db => {
        getEventById(db, eventId).then(event => {
            if (!event) {
                mdui.alert({
                    headline: "提示",
                    description: "找不到对应活动",
                    confirmText: "确定",
                });
                return;
            }
            // 调用API验证票卡
            // 如果是GET请求，应该这样修改：
            fetch(`${event.apiUrl}?ticket_data=${encodeURIComponent(ticketData)}`, {
            method: 'GET'
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    return;
                }
                
                // 保存票卡到数据库
                const ticket = {
                    eventId: eventId,
                    ticket_data: ticketData,
                    ...data
                };
                
                const transaction = db.transaction('tickets', 'readwrite');
                const store = transaction.objectStore('tickets');
                const request = store.add(ticket);
                
                request.onsuccess = () => {
                    location.reload();
                };
                
                request.onerror = (error) => {
                    console.error('保存票卡失败:', error);
                    mdui.alert({
                        headline: "提示",
                        description: "保存票卡失败",
                        confirmText: "确定",
                    });
                };
            })
            .catch(error => {
                console.error('API调用失败:', error);
                mdui.alert({
                    headline: "提示",
                    description: "验证票卡失败",
                    confirmText: "确定",
                });
            });
        });
    });
}

// 显示票卡详情
function showTicketDetail(ticket_name, ticket_number, ticket_state, ticket_data, entry_time) { //在调用函数地方用
    // 获取最新活动数据
    const eventId = document.getElementById('event-select').value;
    console.log(eventId);
    getEventById(window.db, eventId).then(currentEvent => {
        // 创建对话框
        const dialog = document.createElement('div');
        Object.assign(dialog.style, {
            backgroundColor: 'rgba(0,0,0,0.5)',
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '1000'
        });

        const content = document.createElement('mdui-card');
        content.style.padding = '20px';
        content.style.borderRadius = '5px';
        content.style.width = '80%';
        content.style.maxWidth = '500px';
    
        const title = document.createElement('h2');
        title.textContent = '票卡详情';
        content.appendChild(title);
    
        // 显示票卡基本信息
        const nameDiv = document.createElement('div');
        nameDiv.textContent = `票名: ${ticket_name || '无'}`;
        content.appendChild(nameDiv);
    
        const numberDiv = document.createElement('div');
        numberDiv.textContent = `票号: ${ticket_number || '无'}`;
        content.appendChild(numberDiv);
    
        // 状态映射
        const stateMap = {
            '0': '未检票',
            '1': '已检票',
            '2': '黑名单',
            '3': '未售出',
            'default': '未知状态'
        };
        const stateDiv = document.createElement('div');
        stateDiv.textContent = `状态: ${stateMap[ticket_state] || stateMap['default']}`;
        content.appendChild(stateDiv);
    
        // 显示入场时间
        if (entry_time) {
            const timeDiv = document.createElement('div');
            timeDiv.textContent = `入场时间: ${entry_time}`;
            content.appendChild(timeDiv);
        }
    
        // 根据状态决定显示二维码或警告
        if (ticket_state === '0') {
            const qrDiv = document.createElement('div');
            qrDiv.id = 'qrcode';
            qrDiv.style.margin = '20px 0';
            qrDiv.style.textAlign = 'center';
            // 添加白色背景和边距作为外边框
            qrDiv.style.padding = '20px';          // 增加内边距
            qrDiv.style.backgroundColor = 'white'; // 白色背景
            qrDiv.style.borderRadius = '8px';       // 可选圆角
            content.appendChild(qrDiv);
            console.log(ticket_data);
            setTimeout(() => {
                new QRCode(qrDiv, {
                    text: ticket_data,
                    width: 200,
                    height: 200,
                    correctLevel: QRCode.CorrectLevel.H
                });
            }, 0);
        } else {
            const warningDiv = document.createElement('div');
            warningDiv.style.margin = '20px 0';
            warningDiv.textContent = '警告: 此票无效';
            content.appendChild(warningDiv);
        }
    
        const closeBtn = document.createElement('mdui-button');
        closeBtn.textContent = '关闭';
        closeBtn.onclick = () => {
            document.body.removeChild(dialog);
        };
        content.appendChild(closeBtn);
    
        dialog.appendChild(content);
    
        // 添加关闭按钮事件
        closeBtn.onclick = () => {
            dialog.dispatchEvent(new Event('close'));
            document.body.removeChild(dialog);
        };
    
        document.body.appendChild(dialog);
    });
}

// 处理扫描到的活动数据
function handleScannedEventData(data) {
    const parts = data.split('@');
    if (parts.length !== 2) {
        mdui.alert({
            headline: "提示",
            description: "无效的二维码格式，应为: 活动名称:api地址\n二维码内容: "+data,
            confirmText: "确定",
        });
        return;
    }
    
    const eventData = {
        name: parts[0],
        apiUrl: parts[1]
    };
    
    openDB().then(db => {
        const transaction = db.transaction('events', 'readwrite');
        const store = transaction.objectStore('events');
        const request = store.add(eventData);
        
        request.onsuccess = () => {
            location.reload(); // 刷新页面更新活动列表
        };
        
        request.onerror = (error) => {
            console.error('保存活动失败:', error);
            mdui.alert({
                headline: "提示",
                description: "保存活动失败",
                confirmText: "确定",
            });
        };
    });
}

// 删除活动及关联票卡
function deleteEvent(db, eventId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['events', 'tickets'], 'readwrite');
    const eventsStore = transaction.objectStore('events');
    const ticketsStore = transaction.objectStore('tickets');

    // 删除活动
    eventsStore.delete(Number(eventId));

    // 删除关联票卡
    const index = ticketsStore.index('eventId');
    const request = index.openCursor(IDBKeyRange.only(Number(eventId)));
    
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        ticketsStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      location.reload();
      resolve();
    };

    transaction.onerror = (error) => {
      console.error('删除失败:', error);
      mdui.alert({
        headline: "提示",
        description: "删除失败: "+error.target.error.message,
        confirmText: "确定",
    });
      reject(error);
    };
  });
}

// 新增统一删除处理函数
function handleDeleteTicket(ticketId) {
    mdui.confirm({
        headline: "删除票卡",
        description: "确定要删除此票卡吗？",
        confirmText: "确定",
        cancelText: "取消",
        onConfirm: () => deleteTicket(window.db, ticketId)
            .then(() => location.reload())
    });
}