import { computed, onBeforeUnmount, ref } from 'vue';

type RecognitionErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'bad-grammar'
  | 'language-not-supported'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'service-not-allowed';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal?: boolean; 0?: { transcript?: string } }>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onspeechend: (() => void) | null;
  onerror: ((event: { error?: RecognitionErrorCode }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface UseAssistantVoiceOptions {
  onTranscript: (transcript: string) => void | Promise<void>;
  language?: string;
}

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function preferredLanguage(explicit?: string): string {
  if (explicit) return explicit;
  if (typeof document !== 'undefined' && document.documentElement.lang) return document.documentElement.lang;
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  return 'en-NG';
}

function speechErrorMessage(code?: RecognitionErrorCode): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Microphone access is blocked. Allow it in your browser settings and try again.';
  if (code === 'audio-capture') return 'No working microphone was found.';
  if (code === 'network') return 'Voice input needs a network connection. Type your request instead.';
  if (code === 'no-speech') return 'I did not hear anything. Tap the microphone and try again.';
  if (code === 'language-not-supported') return 'Voice input is not available for your current language.';
  if (code === 'aborted') return 'Voice input stopped.';
  return 'Voice input could not start. Type your request instead.';
}

function plainSpeechText(value: string): string {
  if (typeof document === 'undefined') return value.replace(/<[^>]*>/g, ' ');
  const container = document.createElement('div');
  container.innerHTML = value;
  return (container.textContent ?? '')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useAssistantVoice(options: UseAssistantVoiceOptions) {
  const isListening = ref(false);
  const speakResponses = ref(false);
  const voiceStatus = ref('');
  const recognitionSupported = computed(() => Boolean(recognitionConstructor()));
  const synthesisSupported = computed(() => typeof window !== 'undefined' && 'speechSynthesis' in window);
  let recognition: SpeechRecognitionLike | null = null;
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  let recognitionFailed = false;

  function setStatus(message: string, persist = false) {
    voiceStatus.value = message;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = persist || !message ? null : setTimeout(() => { voiceStatus.value = ''; }, 5000);
  }

  function stopListening(abort = true) {
    const activeRecognition = recognition;
    recognition = null;
    isListening.value = false;
    if (!activeRecognition) return;
    try {
      if (abort) activeRecognition.abort();
      else activeRecognition.stop();
    } catch { /* recognition may already have ended */ }
  }

  function toggleListening() {
    if (isListening.value) {
      stopListening(true);
      setStatus('Voice input stopped.');
      return;
    }

    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setStatus('Voice input is not supported in this browser. Type your request instead.', true);
      return;
    }

    recognitionFailed = false;
    const next = new Recognition();
    recognition = next;
    next.lang = preferredLanguage(options.language);
    next.continuous = false;
    next.interimResults = false;
    next.maxAlternatives = 1;
    next.onstart = () => {
      isListening.value = true;
      setStatus('Listening… Speak now.', true);
    };
    next.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      stopListening(false);
      if (!transcript) {
        setStatus('I did not catch that. Tap the microphone and try again.');
        return;
      }
      setStatus('Voice captured. Sending your request.');
      void options.onTranscript(transcript);
    };
    next.onspeechend = () => stopListening(false);
    next.onerror = (event) => {
      recognitionFailed = true;
      recognition = null;
      isListening.value = false;
      setStatus(speechErrorMessage(event.error), event.error === 'not-allowed' || event.error === 'service-not-allowed');
    };
    next.onend = () => {
      recognition = null;
      isListening.value = false;
      if (!recognitionFailed && voiceStatus.value.startsWith('Listening')) setStatus('Voice input ended. Tap the microphone to try again.');
    };

    try {
      next.start();
    } catch {
      recognition = null;
      isListening.value = false;
      setStatus('Voice input is already active or unavailable. Try again.');
    }
  }

  function speakText(value: string) {
    if (!speakResponses.value || !synthesisSupported.value) return;
    const text = plainSpeechText(value);
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = preferredLanguage(options.language);
    utterance.rate = 0.96;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === utterance.lang.toLowerCase())
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('en-ng'))
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('en-gb'))
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('en'))
      ?? null;
    utterance.onerror = () => setStatus('Spoken responses are unavailable right now.');
    window.speechSynthesis.speak(utterance);
  }

  function toggleSpeech() {
    if (!synthesisSupported.value) {
      setStatus('Spoken responses are not supported in this browser.', true);
      return;
    }
    speakResponses.value = !speakResponses.value;
    if (!speakResponses.value) window.speechSynthesis.cancel();
    setStatus(speakResponses.value ? 'Spoken responses enabled.' : 'Spoken responses muted.');
  }

  onBeforeUnmount(() => {
    stopListening(true);
    if (statusTimer) clearTimeout(statusTimer);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  });

  return {
    isListening,
    speakResponses,
    voiceStatus,
    recognitionSupported,
    synthesisSupported,
    toggleListening,
    toggleSpeech,
    speakText,
    stopListening,
  };
}
