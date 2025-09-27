const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ✅ نستخدم المتغيرات من Environment Variables (الأفضل من Settings → Environment في Render)
const INSTANCE_ID = process.env.ULTRA_INSTANCE;
const TOKEN = process.env.ULTRA_TOKEN;
const API_URL = `https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`;

// 🔹 دالة لإرسال رسالة واتساب
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

  let message = "";

  // 🔹 إنشاء الطلب
  if (status === "pending") {
    message = `📦 تم استلام طلبك بنجاح ❤️  
رقم الطلب: #${order.name}  
الإجمالي: ${order.total_price} ${order.currency}  

سنعمل على معالجته قريبًا وبتصلك التحديثات عبر الواتساب.  
شكرًا لاختيارك eSelect 🌟`;
  }

  // 🔹 تمام الدفع
  if (status === "paid") {
    message = `💳 تم استلام الدفع بنجاح ✅  
رقم الطلب: #${order.name}  
المبلغ المدفوع: ${order.total_price} ${order.currency}  

طلبك الآن تحت التجهيز ✨`;
  }

  // 🔹 تم الشحن
  if (fulfillment === "shipped") {
    const tracking_number = order.fulfillments?.[0]?.tracking_number || "غير متوفر";
    const shipping_company = order.fulfillments?.[0]?.tracking_company || "شركة الشحن";

    message = `🚚 تم شحن طلبك 🎉  
رقم الطلب: #${order.name}  

📍 شركة الشحن: ${shipping_company}  
🔎 رقم التتبع: ${tracking_number}  

يمكنك متابعة حالة الشحنة من خلال رابط التتبع.`;
  }

  // 🔹 تم الاكتمال
  if (fulfillment === "fulfilled") {
    message = `🎊 مبروك! تم اكتمال طلبك بنجاح ❤️  
رقم الطلب: #${order.name}  

نأمل أن تنال منتجاتنا إعجابك 🌟  
ولا تنسَ تقييم تجربتك معنا 🙏`;
  }

  // ✉️ إرسال الرسالة الرئيسية
  if (message) {
    await sendWhatsAppMessage(phone, message);
  }

  // 🔑 لو الطلب رقمي (LikeCard) وعنده ملاحظة (سيريالات)
  if (isDigital && order.note) {
    const digitalMsg = `🔑 تفاصيل طلبك الرقمي:  

${order.note}  

يرجى الاحتفاظ بهذه البيانات بعناية وعدم مشاركتها مع أي شخص.  
شكرًا لتسوقك من eSelect ❤️`;

    await sendWhatsAppMessage(phone, digitalMsg);
  }

  res.status(200).send("OK");
});

// ✅ المنفذ
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Service running on port ${PORT}`);
});
