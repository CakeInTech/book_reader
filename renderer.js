// Basic logger
const log = (...args) => {
	console.log('[renderer]', ...args);
	const dbg = document.getElementById('debug');
	if (dbg) {
		dbg.textContent += args.map(a => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join(' ') + '\n';
	}
};

// Elements
const els = {
	fileInput: () => document.getElementById('file-input'),
	voiceSelect: () => document.getElementById('voice-select'),
	refreshVoices: () => document.getElementById('refresh-voices'),
	testVoice: () => document.getElementById('test-voice'),
	showVoicesRaw: () => document.getElementById('show-voices-raw'),
	rateInput: () => document.getElementById('rate-input'),
	readBtn: () => document.getElementById('read-btn'),
	readPagesBtn: () => document.getElementById('read-pages-btn'),
	pauseBtn: () => document.getElementById('pause-btn'),
	resumeBtn: () => document.getElementById('resume-btn'),
	stopBtn: () => document.getElementById('stop-btn'),
	pdfViewer: () => document.getElementById('pdf-viewer'),
	pageInfo: () => document.getElementById('page-info'),
	prevPage: () => document.getElementById('prev-page'),
	nextPage: () => document.getElementById('next-page'),
	selectedText: () => document.getElementById('selected-text'),
	voiceStatus: () => document.getElementById('voice-status'),
};

// State
let state = {
	pdfDoc: null,
	currentPage: 1,
	isReading: false,
	cancelRead: false,
};

// Wait for pdfjsLib to be present (from index.html ESM import)
async function waitForPdfJs(timeoutMs = 5000) {
	const start = Date.now();
	while (!window.pdfjsLib) {
		if (Date.now() - start > timeoutMs) throw new Error('pdfjsLib failed to load');
		await new Promise(r => setTimeout(r, 50));
	}
	return window.pdfjsLib;
}

async function getVoices() {
	try {
		const voices = await window.electronAPI.getVoices();
		return voices;
	} catch (e) {
		log('getVoices error', e);
		return [];
	}
}

function populateVoices(voices) {
	const sel = els.voiceSelect();
	sel.innerHTML = '';
	if (!voices || voices.length === 0) {
		const opt = document.createElement('option');
		opt.value = '';
		opt.textContent = 'No voices found';
		sel.appendChild(opt);
		els.voiceStatus().textContent = 'No macOS voices detected. Check that /usr/bin/say is available.';
		return;
	}
	voices.forEach(v => {
		const label = `${v.name} ${v.locale ? '(' + v.locale + ')' : ''} ${v.age ? 'age ' + v.age : ''}`.trim();
		const opt = document.createElement('option');
		opt.value = v.name;
		opt.textContent = label;
		sel.appendChild(opt);
	});
	els.voiceStatus().textContent = `${voices.length} voices available`;
}

async function refreshVoices() {
	const voices = await getVoices();
	populateVoices(voices);
}

function getSelectedVoice() {
	return els.voiceSelect().value || undefined;
}

function getRate() {
	const v = parseInt(els.rateInput().value, 10);
	return Number.isFinite(v) ? v : 200;
}

async function speak(text) {
	if (!text || !text.trim()) return;
	const voice = getSelectedVoice();
	const rate = getRate();
	return window.electronAPI.speakText({ text, voice, rate });
}

function stop() {
	state.cancelRead = true;
	return window.electronAPI.stopSpeech();
}

function pause() { return window.electronAPI.pauseSpeech(); }
function resume() { return window.electronAPI.resumeSpeech(); }

// PDF Handling
async function openPdfFromFile(file) {
	const arrayBuf = await file.arrayBuffer();
	const pdfjsLib = await waitForPdfJs();
	const loadingTask = pdfjsLib.getDocument({ data: arrayBuf });
	state.pdfDoc = await loadingTask.promise;
	state.currentPage = 1;
	await renderPage(state.currentPage);
}

async function renderPage(pageNum) {
	const pdf = state.pdfDoc; if (!pdf) return;
	pageNum = Math.max(1, Math.min(pdf.numPages, pageNum));
	state.currentPage = pageNum;
	const page = await pdf.getPage(pageNum);
	const textContent = await page.getTextContent();
	const strings = textContent.items.map(i => ('str' in i ? i.str : i));
	const text = strings.join(' ');
	els.selectedText().value = text;

	// Simple textual render with basic separation; could be enhanced later
	const viewer = els.pdfViewer();
	viewer.innerHTML = '';
	const para = document.createElement('div');
	para.className = 'prose max-w-none whitespace-pre-wrap leading-7 text-slate-800';
	para.textContent = text;
	viewer.appendChild(para);

	els.pageInfo().textContent = `Page ${pageNum} / ${pdf.numPages}`;
}

// Read selected textarea text
async function onReadSelection() {
	const text = els.selectedText().value;
	state.isReading = true;
	state.cancelRead = false;
	try {
		await speak(text);
	} finally {
		state.isReading = false;
	}
}

// Auto read page -> next page
async function onReadFromPage() {
	if (!state.pdfDoc) return;
	state.isReading = true;
	state.cancelRead = false;
	try {
		for (let p = state.currentPage; p <= state.pdfDoc.numPages; p++) {
			if (state.cancelRead) break;
			await renderPage(p);
			const text = els.selectedText().value;
			await speak(text);
		}
	} finally {
		state.isReading = false;
	}
}

function wireUI() {
	els.fileInput().addEventListener('change', async (e) => {
		const file = e.target.files && e.target.files[0];
		if (file) {
			try {
				await openPdfFromFile(file);
			} catch (err) {
				log('Error opening PDF', err);
			}
		}
	});

	els.prevPage().addEventListener('click', () => {
		if (!state.pdfDoc) return;
		renderPage(Math.max(1, state.currentPage - 1));
	});
	els.nextPage().addEventListener('click', () => {
		if (!state.pdfDoc) return;
		renderPage(Math.min(state.pdfDoc.numPages, state.currentPage + 1));
	});

	els.readBtn().addEventListener('click', onReadSelection);
	els.readPagesBtn().addEventListener('click', onReadFromPage);
	els.pauseBtn().addEventListener('click', pause);
	els.resumeBtn().addEventListener('click', resume);
	els.stopBtn().addEventListener('click', stop);

	els.refreshVoices().addEventListener('click', refreshVoices);
	els.testVoice().addEventListener('click', () => speak('This is a test of the selected voice.'));
	els.showVoicesRaw().addEventListener('click', async () => {
		const raw = await window.electronAPI.getVoicesRaw();
		log('voices raw\n' + raw);
	});
}

async function init() {
	try {
		await waitForPdfJs();
	} catch (e) {
		log('pdf.js failed to initialize', e);
	}
	wireUI();
	refreshVoices();
}

document.addEventListener('DOMContentLoaded', init);

