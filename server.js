const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ✅ نستخدم المتغيرات من Environment Variables
const INSTANCE_ID = process.env.ULTRA_INSTANCE;
const TOKEN = process.env.ULTRA_TOKEN;
const API_URL = `https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`;

// دالة لإرسال رسالة واتساب
async function sendWhatsAppMessage(phone, message) {
  try {
    const response = await axios.post(API_URL, {
      to: phone,
      body: message
    }, {
      headers: { "Content-Type": "application/json" },
      params: { token: TOKEN }
    });

    console.log("✅ رسالة واتساب أُرسلت:", response.data);
  } catch (err) {
    console.error("❌ خطأ أثناء الإرسال:", err.response?.data || err.message);
  }
}

// ✅ Route اختبار
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Service up and running");
});

// ✅ Webhook لتلقي الطلبات من Shopify
app.post("/whatsapp-webhook", async (req, res) => {
  const order = req.body;
  const phone = order?.shipping_address?.phone || order?.billing_address?.phone;

  if (!phone) {
    console.log("⚠️ لا يوجد رقم هاتف في الطلب");
    return res.status(200).send("No phone number");
  }

  // تحديد الحالة
  const status = order.financial_status || "pending";  
  const fulfillment = order.fulfillment_status || "unfulfilled";  
  const isDigital = order.line_items.some(line =>
    line.product_type === "Digital" || line.title.includes("LikeCard")
  );

  let message = `📦 تحديث طلبك #${order.name}\n`;

  if (status === "pending") {
    message += `✅ تم إنشاء الطلب.\nالإجمالي: ${order.total_price} ${order.currency}`;
  }
  if (status === "paid") {
    message += `💳 تم الدفع بنجاح.\nالمبلغ: ${order.total_price} ${order.currency}`;
  }
  if (fulfillment === "shipped") {
    message += `\n🚚 تم شحن الطلب.`;
  }
  if (fulfillment === "fulfilled") {
    message += `\n🎉 تم اكتمال الطلب.`;
  }

  if (isDigital) {
    const note = order.note || "سيتم إرسال السيريالات لاحقاً.";
    message += `\n🔑 ${note}`;
  }

  // إرسال الرسالة
  await sendWhatsAppMessage(phone, message);

  res.status(200).send("OK");
});

// ✅ المنفذ
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Service running on port ${PORT}`);
});
