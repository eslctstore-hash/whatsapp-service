const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const INSTANCE_ID = process.env.ULTRA_INSTANCE;
const TOKEN = process.env.ULTRA_TOKEN;
const API_URL = `https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`;

// إرسال رسالة واتساب
async function sendWhatsAppMessage(phone, message) {
  try {
    await axios.post(API_URL, {
      to: phone,
      body: message
    }, {
      headers: { "Content-Type": "application/json" },
      params: { token: TOKEN }
    });
    console.log("✅ أُرسلت:", message);
  } catch (err) {
    console.error("❌ خطأ:", err.response?.data || err.message);
  }
}

// منع التكرار عبر محتوى الرسالة
const sentCache = new Set();
function shouldSend(key) {
  if (sentCache.has(key)) return false;
  sentCache.add(key);
  return true;
}

// Route اختبار
app.get("/", (req, res) => res.send("🚀 WhatsApp Service running"));

// Webhook
app.post("/whatsapp-webhook", async (req, res) => {
  const topic = req.headers["x-shopify-topic"];
  const order = req.body;
  const phone = order?.shipping_address?.phone || order?.billing_address?.phone;

  if (!phone) return res.status(200).send("No phone");

  const orderId = order.id || order.order_id || order.name;
  const status = order.financial_status || "pending";
  const fulfillment = order.fulfillment_status || "unfulfilled";
  const isDigital = order.line_items?.some(line =>
    line.product_type === "Digital" || line.title.includes("LikeCard")
  );

  let message = "";

  // ----------------------------
  // 1. استلام الطلب
  // ----------------------------
  if (topic === "orders/create") {
    const shippingMethod = order.shipping_lines?.[0]?.title || "لم يحدد";
    const paymentMethod = order.payment_gateway_names?.[0] || "غير محدد";
    const key = `create-${orderId}`;
    if (shouldSend(key)) {
      message = `📦 تم استلام طلبك  
رقم الطلب: #${order.name}  
المنتج: ${order.line_items[0].title} × ${order.line_items[0].quantity}  
السعر: ${order.line_items[0].price} ${order.currency}  
الإجمالي: ${order.total_price} ${order.currency}  
الشحن: ${shippingMethod}  
الحالة: ${fulfillment || "قيد المعالجة"}  
الدفع: ${status} عبر ${paymentMethod}`;
    }
  }

  // ----------------------------
  // 2. الدفع
  // ----------------------------
  if (topic === "orders/paid") {
    const key = `paid-${orderId}`;
    if (shouldSend(key)) {
      message = `💳 تم تأكيد الدفع  
رقم الطلب: #${order.name}  
المنتج: ${order.line_items[0].title}  
المبلغ: ${order.total_price} ${order.currency}`;
    }
  }

  // ----------------------------
  // 3. الشحن (من fulfillment أو update)
  // ----------------------------
  if ((topic === "fulfillments/create" || topic === "fulfillments/update" || topic === "orders/updated") && !isDigital) {
    const trackingNumber = order.tracking_number || order.fulfillments?.[0]?.tracking_number;
    const trackingCompany = order.tracking_company || order.fulfillments?.[0]?.tracking_company;
    const trackingUrl = order.tracking_url || order.fulfillments?.[0]?.tracking_url;

    if (trackingNumber || trackingUrl) {
      const key = `track-${orderId}-${trackingNumber || trackingUrl}`;
      if (shouldSend(key)) {
        message = `🚚 تم شحن طلبك  
رقم الطلب: #${order.name || order.order_id}  
الناقل: ${trackingCompany || "غير محدد"}` +
          (trackingNumber ? `\n🔎 رقم التتبع: ${trackingNumber}` : "") +
          (trackingUrl ? `\n🔗 رابط التتبع: ${trackingUrl}` : "");
      }
    }
  }

  // ----------------------------
  // 4. اكتمال الطلب
  // ----------------------------
  if (topic === "orders/fulfilled") {
    const key = `fulfilled-${orderId}`;
    if (shouldSend(key)) {
      message = `🎉 تم اكتمال طلبك  
رقم الطلب: #${order.name}  
طلبك مدفوع ومكتمل ✅  

شكرًا لتعاملك معنا ❤️  
ونتطلع لخدمتك مجددًا 🌟`;
    }
  }

  // ----------------------------
  // 5. الملاحظات (للسيريالات)
  // ----------------------------
  if (topic === "orders/updated" && isDigital && order.note) {
    const key = `note-${orderId}-${order.note}`;
    if (shouldSend(key)) {
      message = `🔑 تم إنشاء رمز الاسترداد لطلبك  

${order.note}`;
    }
  }

  if (message) await sendWhatsAppMessage(phone, message);

  res.status(200).send("OK");
});

// تشغيل
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 WhatsApp Service on port ${PORT}`));
