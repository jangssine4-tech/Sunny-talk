/**
 * Sunny Talk — Firebase Cloud Functions
 * 역할: OpenAI API Key를 서버에서만 보관하고,
 *       클라이언트에는 60초짜리 ephemeral token만 발급
 */

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");

// 배포 리전 설정 (한국에서 가장 가까운 도쿄)
setGlobalOptions({ region: "asia-northeast1" });

// ✅ OpenAI Key는 Firebase Secret Manager에만 보관
//    배포 시: firebase functions:secrets:set OPENAI_API_KEY
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// ✅ 앱 식별 Secret (클라이언트가 Functions를 호출할 때 사용)
//    배포 시: firebase functions:secrets:set APP_SECRET
const APP_SECRET = defineSecret("APP_SECRET");

/**
 * getRealtimeToken
 * - 클라이언트 → 이 함수 → OpenAI /v1/realtime/sessions
 * - OpenAI가 발급한 ephemeral token만 클라이언트에 반환
 * - ephemeral token 수명: 60초, 1회용 → 노출돼도 무해
 */
exports.getRealtimeToken = onRequest(
  {
    secrets: [OPENAI_API_KEY, APP_SECRET],
    // CORS 허용 도메인 — 본인 GitHub Pages / 커스텀 도메인으로 변경
    cors: [
      /github\.io$/,          // GitHub Pages (*.github.io)
      /localhost:\d+$/,       // 로컬 개발
      "https://yourdomain.com", // 커스텀 도메인 (필요 시 추가)
    ],
    timeoutSeconds: 30,
    maxInstances: 10,
  },
  async (req, res) => {
    // ── OPTIONS preflight ──────────────────────────
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    // ── POST만 허용 ────────────────────────────────
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // ── 앱 식별자 검증 ─────────────────────────────
    // 클라이언트가 보내는 x-app-secret 헤더 확인
    const clientSecret = req.headers["x-app-secret"];
    if (!clientSecret || clientSecret !== APP_SECRET.value()) {
      console.warn("Unauthorized request:", req.ip);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // ── 요청 파라미터 추출 ─────────────────────────
    const {
      model = "gpt-4o-mini-realtime-preview-2024-12-17",
      instructions = "You are a helpful English tutor.",
      voice = "shimmer",
    } = req.body || {};

    // 허용된 모델만 통과
    const allowedModels = [
      "gpt-4o-mini-realtime-preview-2024-12-17",
      "gpt-4o-realtime-preview-2024-12-17",
    ];
    if (!allowedModels.includes(model)) {
      res.status(400).json({ error: "Invalid model" });
      return;
    }

    // ── OpenAI에 ephemeral token 요청 ──────────────
    try {
      const openaiRes = await fetch(
        "https://api.openai.com/v1/realtime/sessions",
        {
          method: "POST",
          headers: {
            // ✅ API Key는 여기서만 사용 — 클라이언트에 절대 노출 안 됨
            Authorization: `Bearer ${OPENAI_API_KEY.value()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            voice,
            instructions,
            turn_detection: {
              type: "server_vad",
              silence_duration_ms: 600,
              threshold: 0.5,
            },
            input_audio_transcription: { model: "whisper-1" },
          }),
        }
      );

      if (!openaiRes.ok) {
        const errBody = await openaiRes.json().catch(() => ({}));
        console.error("OpenAI error:", openaiRes.status, errBody);
        res.status(502).json({
          error: "OpenAI API error",
          status: openaiRes.status,
        });
        return;
      }

      const data = await openaiRes.json();
      const ephemeralToken = data.client_secret?.value;

      if (!ephemeralToken) {
        res.status(502).json({ error: "No token received from OpenAI" });
        return;
      }

      // ✅ ephemeral token만 반환 (60초 수명, 1회용)
      console.log(
        `Token issued: student session, model=${model}, ip=${req.ip}`
      );
      res.status(200).json({ token: ephemeralToken });
    } catch (err) {
      console.error("Function error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * saveSessionLog (선택 기능)
 * 세션 완료 후 Firestore에 대화 로그 저장
 */
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");

// Firebase Admin 초기화 (한 번만)
let adminInitialized = false;
function getAdmin() {
  if (!adminInitialized) {
    initializeApp();
    adminInitialized = true;
  }
  return getFirestore();
}

exports.saveSessionLog = onRequest(
  {
    region: "asia-northeast1",
    cors: [/github\.io$/, /localhost:\d+$/],
    timeoutSeconds: 15,
  },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const {
      studentId,
      studentName,
      lessonId,
      lessonTitle,
      turns,
      seconds,
    } = req.body || {};

    if (!studentId || !lessonId) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    try {
      const db = getAdmin();
      await db.collection("sessions").add({
        studentId,
        studentName: studentName || "Unknown",
        lessonId,
        lessonTitle: lessonTitle || "",
        turns: parseInt(turns) || 0,
        seconds: parseInt(seconds) || 0,
        createdAt: new Date(),
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Firestore error:", err);
      res.status(500).json({ error: "Failed to save log" });
    }
  }
);
