function updateMembersList() {
    ui.membersList.innerHTML = ''; ui.peerCount.textContent = AppState.members.length;
    AppState.members.forEach(m => {
        const isOwner = m.role === ROLES.OWNER; const isAdmin = m.role === ROLES.ADMIN; const isSelf = m.id === AppState.peerId;
        const userHexColor = getUserColor(m.name + m.id);
        const li = document.createElement('li'); li.className = 'flex items-center justify-between p-2 group transition-colors';

        let actionsHtml = '';
        if (!isSelf) {
            if (AppState.myRole === ROLES.OWNER) {
                actionsHtml = `<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    ${isAdmin ? `<button class="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-yellow-400 transition-colors" title="Demote to Member" onclick="executeCommand('SET_ROLE', { targetId: '${m.id}', role: '${ROLES.MEMBER}' })"><span class="material-symbols-rounded text-[14px]">gpp_bad</span></button>` : `<button class="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-yellow-400 transition-colors" title="Promote to Admin" onclick="executeCommand('SET_ROLE', { targetId: '${m.id}', role: '${ROLES.ADMIN}' })"><span class="material-symbols-rounded text-[14px]">gpp_good</span></button>`}
                    <button class="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400 transition-colors" title="Kick User" onclick="executeCommand('KICK', { targetId: '${m.id}' })"><span class="material-symbols-rounded text-[14px]">person_remove</span></button></div>`;
            } else if (AppState.myRole === ROLES.ADMIN && m.role === ROLES.MEMBER) {
                actionsHtml = `<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button class="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400 transition-colors" title="Kick User" onclick="executeCommand('KICK', { targetId: '${m.id}' })"><span class="material-symbols-rounded text-[14px]">person_remove</span></button></div>`;
            }
        }

        li.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="flex flex-col justify-center">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-bold text-sm" style="color: ${userHexColor}">@${m.name}</span>
                        ${isOwner ? `<span class="bg-[#be0aff] text-white px-2.5 py-0.5 rounded-full flex items-center justify-center shadow-md" title="Owner"><span class="material-symbols-rounded" style="font-size: 18px;">crown</span></span>` : ''}
                        ${isAdmin ? `<span class="bg-[#ff8700] text-white px-2.5 py-0.5 rounded-full flex items-center justify-center shadow-md" title="Admin"><span class="material-symbols-rounded" style="font-size: 18px;">stars</span></span>` : ''}
                        ${isSelf ? '<span class="text-[10px] text-slate-500 uppercase tracking-wider ml-1">(You)</span>' : ''}
                    </div>
                </div>
            </div>${actionsHtml}`;
        ui.membersList.appendChild(li);
    });
}

// ---------------------------------------------------------
// ATTACHMENTS & GIF LOGIC
// ---------------------------------------------------------
ui.btnChatAttach.addEventListener('click', () => ui.chatFileInput.click());
ui.chatFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return; if (!file.type.startsWith('image/')) return showToast('Please select an image or gif', 'error');

    const reader = new FileReader();
    reader.onload = (event) => {
        if (file.type === 'image/gif') {
            if (file.size > 1024 * 1024 * 2) return showToast('GIF is too large. Max 2MB.', 'error');
            pendingChatImage = event.target.result; ui.chatImagePreview.src = pendingChatImage; ui.chatImagePreviewContainer.classList.remove('hidden');
        } else {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
                const maxW = 400, maxH = 400; let width = img.width, height = img.height;
                if (width > height) { if (width > maxW) { height *= maxW / width; width = maxW; } } else { if (height > maxH) { width *= maxH / height; height = maxH; } }
                canvas.width = width; canvas.height = height; ctx.drawImage(img, 0, 0, width, height);
                pendingChatImage = canvas.toDataURL(file.type || 'image/jpeg', 0.8);
                ui.chatImagePreview.src = pendingChatImage; ui.chatImagePreviewContainer.classList.remove('hidden');
            };
            img.src = event.target.result;
        }
    };
    reader.readAsDataURL(file); ui.chatFileInput.value = '';
});

ui.btnRemoveImage.addEventListener('click', () => { pendingChatImage = null; ui.chatImagePreviewContainer.classList.add('hidden'); ui.chatImagePreview.src = ''; });

const fetchGifs = async (query) => {
    ui.gifResults.innerHTML = '<div class="col-span-3 text-center text-slate-500 text-xs py-4">Loading...</div>';
    try {
        const apiKey = 'LIVDSRZULELA';
        const url = query === 'trending' ? `https://g.tenor.com/v1/trending?key=${apiKey}&limit=24` : `https://g.tenor.com/v1/search?key=${apiKey}&q=${encodeURIComponent(query)}&limit=24`;
        const res = await fetch(url); if (!res.ok) throw new Error('API Request Failed');
        const data = await res.json(); ui.gifResults.innerHTML = '';

        if (!data.results || data.results.length === 0) { ui.gifResults.innerHTML = '<div class="col-span-3 text-center text-slate-500 text-xs py-4">No GIFs found</div>'; return; }
        data.results.forEach(gif => {
            const imgUrl = gif.media[0].tinygif.url; const sendUrl = gif.media[0].gif.url;
            const el = document.createElement('img'); el.src = imgUrl; el.className = 'w-full h-20 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity bg-slate-900 border border-slate-700/50';
            el.onclick = () => { sendGifMessage(sendUrl); ui.gifPopup.classList.add('hidden'); ui.gifPopup.classList.remove('flex'); };
            ui.gifResults.appendChild(el);
        });
    } catch (err) { ui.gifResults.innerHTML = '<div class="col-span-3 text-center text-red-400 text-xs py-4">Failed to load GIFs</div>'; }
};

const debounceGifSearch = debounce((q) => fetchGifs(q), 500);

ui.btnChatGif.addEventListener('click', () => {
    const isHidden = ui.gifPopup.classList.contains('hidden');
    if (isHidden) { ui.gifPopup.classList.remove('hidden'); ui.gifPopup.classList.add('flex'); ui.gifSearchInput.focus(); if (ui.gifResults.children.length === 0) fetchGifs('trending'); }
    else { ui.gifPopup.classList.add('hidden'); ui.gifPopup.classList.remove('flex'); }
});

ui.gifSearchInput.addEventListener('input', (e) => { const val = e.target.value.trim(); if (val) debounceGifSearch(val); else debounceGifSearch('trending'); });
ui.btnCloseGif.addEventListener('click', () => { ui.gifPopup.classList.add('hidden'); ui.gifPopup.classList.remove('flex'); });
document.addEventListener('click', (e) => { if (!ui.gifPopup.classList.contains('hidden') && !ui.gifPopup.contains(e.target) && !ui.btnChatGif.contains(e.target)) { ui.gifPopup.classList.add('hidden'); ui.gifPopup.classList.remove('flex'); } });

function sendGifMessage(gifUrl) {
    const msgData = { type: 'CHAT', peerId: AppState.peerId, name: AppState.displayName, role: AppState.myRole, message: '', image: gifUrl };
    renderChatMessage(msgData, true); if (AppState.isHost) broadcast(msgData); else sendToHost(msgData);
}

// ---------------------------------------------------------
// CHAT RENDERING & SUBMIT
// ---------------------------------------------------------
function renderChatMessage(data, isSelf) {
    const { peerId, name, role, message, image } = data;
    const safePeerId = peerId || 'host';
    const userHexColor = getUserColor(name + safePeerId);
    const div = document.createElement('div'); div.className = `px-2 py-1.5 hover:bg-slate-800/50 rounded transition-colors w-full break-words`;

    let formattedMessage = '';
    if (message) {
        const escapedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        formattedMessage = escapedMessage.replace(/(https?:\/\/[^\s]+)/g, (url) => {
            if (url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) return `<br><img src="${url}" class="max-w-[200px] max-h-[200px] object-cover rounded shadow-sm border border-slate-700 mt-1 mb-1 inline-block"><br>`;
            return `<a href="${url}" target="_blank" class="text-blue-400 hover:underline">${url}</a>`;
        });
    }

    div.innerHTML = `
        <div class="inline items-baseline text-sm leading-relaxed text-slate-200">
            <span class="inline-flex items-center gap-1.5 mr-1 align-middle mb-0.5">
                <span class="font-bold tracking-wide" style="color: ${userHexColor}">@${name}</span>
                ${role === ROLES.OWNER ? `<span class="bg-[#be0aff] text-white px-2 py-0.5 rounded-full flex items-center justify-center shadow-md translate-y-[-1px] ml-1" title="Owner"><span class="material-symbols-rounded" style="font-size: 16px;">crown</span></span>` : ''}
                ${role === ROLES.ADMIN ? `<span class="bg-[#ff8700] text-white px-2 py-0.5 rounded-full flex items-center justify-center shadow-md translate-y-[-1px] ml-1" title="Admin"><span class="material-symbols-rounded" style="font-size: 16px;">stars</span></span>` : ''}
            </span>
            <span class="align-middle">${formattedMessage}</span>
        </div>
        ${image ? `<br><img src="${image}" class="max-w-[200px] max-h-[200px] object-contain rounded shadow-sm border border-slate-700 mt-1 mb-1 inline-block">` : ''}
    `;
    ui.chatMessages.appendChild(div); ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
}

ui.chatForm.addEventListener('submit', (e) => {
    e.preventDefault(); const text = ui.chatInput.value.trim(); if (!text && !pendingChatImage) return;
    const msgData = { type: 'CHAT', peerId: AppState.peerId, name: AppState.displayName, role: AppState.myRole, message: text, image: pendingChatImage };
    renderChatMessage(msgData, true); ui.chatInput.value = ''; pendingChatImage = null; ui.chatImagePreviewContainer.classList.add('hidden'); ui.chatImagePreview.src = '';
    if (AppState.isHost) broadcast(msgData); else sendToHost(msgData);
});

if(ui.btnCopyLink) {
    ui.btnCopyLink.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            const originalText = ui.btnCopyLink.innerHTML; ui.btnCopyLink.innerHTML = `<span class="material-symbols-rounded text-[16px]">check</span> <span class="hidden sm:inline">Copied!</span>`;
            setTimeout(() => ui.btnCopyLink.innerHTML = originalText, 2000);
        });
    });
}