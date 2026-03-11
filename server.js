const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const config = require("./config");

const app = express();
app.use(bodyParser.json());

const TELEGRAM_API = `https://api.telegram.org/bot${config.BOT_TOKEN}`;

const userSessions = {};


// ===============================
// GET ZOHO ACCESS TOKEN
// ===============================
async function getZohoAccessToken() {

 try {

  const response = await axios.post(
   "https://accounts.zoho.in/oauth/v2/token",
   null,
   {
    params: {
     refresh_token: config.ZOHO_REFRESH_TOKEN,
     client_id: config.ZOHO_CLIENT_ID,
     client_secret: config.ZOHO_CLIENT_SECRET,
     grant_type: "refresh_token"
    }
   }
  );

  return response.data.access_token;

 } catch (error) {

  console.log("Zoho Token Error:", error.response?.data || error.message);
  throw error;

 }

}


// ===============================
// SEND TELEGRAM MESSAGE
// ===============================
async function sendMessage(chatId, text, keyboard = null) {

 const payload = {
  chat_id: chatId,
  text: text
 };

 if (keyboard) {
  payload.reply_markup = keyboard;
 }

 await axios.post(`${TELEGRAM_API}/sendMessage`, payload);

}


// ===============================
// HOMEPAGE
// ===============================
app.get("/", (req, res) => {
 res.send("Telegram Zoho Bot Running 🚀");
});


// ===============================
// TELEGRAM WEBHOOK
// ===============================
app.post("/webhook", async (req, res) => {

 const message = req.body.message;

 if (!message) return res.sendStatus(200);

 const chatId = message.chat.id;
 const text = message.text;

 console.log("User:", chatId, text);


 // ============================
 // START COMMAND
 // ============================
 if (text === "/start") {

  userSessions[chatId] = { step: "category" };

  const keyboard = {
   keyboard: [
    ["Website Issue"],
    ["Server Issue"],
    ["Billing Issue"],
    ["Other Issue"]
   ],
   resize_keyboard: true
  };

  await sendMessage(chatId, "Hello 👋\nSelect your issue:", keyboard);

  return res.sendStatus(200);
 }


 const session = userSessions[chatId];

 if (!session) {
  await sendMessage(chatId, "Please type /start to begin.");
  return res.sendStatus(200);
 }


 // ============================
 // CATEGORY STEP
 // ============================
 if (session.step === "category") {

  session.category = text;
  session.step = "description";

  await sendMessage(chatId, "Please describe your issue.");

  return res.sendStatus(200);
 }


 // ============================
 // DESCRIPTION → CREATE TICKET
 // ============================
 if (session.step === "description") {

  try {

   const accessToken = await getZohoAccessToken();

   const ticket = await axios.post(
    "https://desk.zoho.in/api/v1/tickets",
    {
     subject: `Telegram Issue: ${session.category}`,
     departmentId: config.ZOHO_DEPARTMENT_ID,
     contactId: config.ZOHO_CONTACT_ID,
     description: text
    },
    {
     headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      orgId: config.ZOHO_ORG_ID,
      "Content-Type": "application/json"
     }
    }
   );

   session.ticketId = ticket.data.id;
   session.step = "conversation";

   await sendMessage(
    chatId,
    `🎫 Ticket Created\nTicket ID: ${session.ticketId}\n\nContinue describing your issue.\nType "completed" when finished.`
   );

  } catch (error) {

   console.log("Zoho Ticket Error:", error.response?.data || error.message);

   await sendMessage(chatId, "❌ Ticket creation failed.");

  }

  return res.sendStatus(200);
 }


 // ============================
 // CONVERSATION MODE
 // ============================
 if (session.step === "conversation") {

  if (text.toLowerCase() === "completed") {

   await sendMessage(chatId, "✅ Your ticket has been closed.");

   delete userSessions[chatId];

   return res.sendStatus(200);
  }

  try {

   const accessToken = await getZohoAccessToken();

   await axios.post(
    `https://desk.zoho.in/api/v1/tickets/${session.ticketId}/threads`,
    {
     content: text
    },
    {
     headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      orgId: config.ZOHO_ORG_ID,
      "Content-Type": "application/json"
     }
    }
   );

  } catch (error) {

   console.log("Zoho Comment Error:", error.response?.data || error.message);

  }

 }

 res.sendStatus(200);

});


// ===============================
// SERVER START
// ===============================
app.listen(3000, () => {

 console.log("Server running on port 3000 🚀");

});