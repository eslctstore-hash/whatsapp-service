const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ✅ بيانات UlraMsg من الـ Environment Variables
const INSTANCE_ID = process.env.ULTRA_INSTANCE;
const TOKEN = process.env.ULTRA_TOKEN;
const API_URL = `https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`;

// ✅ دالة لإرسال رسالة واتساب
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

// ✅ ذاكرة مؤقتة لمنع تكرار نفس الحالة لنفس الطلب
const lastStatusMap = new Map();
function shouldSend(orderId, status, fulfillment) {
  const last = lastStatusMap.get(orderId);
  const current = `${status}-${fulfillment}`;
  if (last === current) {
    return false; // نفس الحالة أُرسلت من قبل
  }
  lastStatusMap.set(orderId, current);
  return true;
}

// ✅ Route اختبار
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Service up and running");
});

// ✅ Webhook من Shopify
app.post("/whatsapp-webhook", async (req, res) => {
  const order = req.body;
  const phone = order?.shipping_address?.phone || order?.billing_address?.phone;
  const topic = req.headers["x-shopify-topic"]; // نوع الحدث (orders/create, orders/paid, orders/updated, etc.)

  if (!phone) {
    console.log("⚠️ لا يوجد رقم هاتف في الطلب");
    return res.status(200).send("No phone number");
  }

  const orderId = order.id || order.name;
  const status = order.financial_status || "pending";
  const fulfillment = order.fulfillment_status || "unfulfilled";
  const isDigital = order.line_items.some(line =>
    line.product_type === "Digital" || line.title.includes("LikeCard")
  );

  let message = "";

  // 🔹 رسالة استلام الطلب
  if (status === "pending") {
    const shippingMethod = order.shipping_lines?.[0]?.title || "لم يحدد";
    const paymentMethod = order.payment_gateway_names?.[0] || "غير محدد";
    message = `📦 تم استلام طلبك بنجاح  
رقم الطلب: #${order.name}  
المنتج: ${order.line_items[0].title} × ${order.line_items[0].quantity}  
السعر: ${order.line_items[0].price} ${order.currency}  
الإجمالي: ${order.total_price} ${order.currency}  
الشحن: ${shippingMethod}  
حالة الطلب: ${order.fulfillment_status || "قيد المعالجة"}  
الدفع: ${order.financial_status} عبر ${paymentMethod}`;
  }

  // 🔹 رسالة تأكيد الدفع
  if (status === "paid" && fulfillment === "unfulfilled") {
    message = `💳 تم تأكيد الدفع  
رقم الطلب: #${order.name}  
المنتج: ${order.line_items[0].title}  
المبلغ: ${order.total_price} ${order.currency}`;
  }

  // 🔹 رسالة شحن الطلب (فقط للمنتجات المادية)
  if (fulfillment === "shipped" && !isDigital) {
    const trackingNumber = order.fulfillments?.[0]?.tracking_number || null;
    const trackingCompany = order.fulfillments?.[0]?.tracking_company || "غير محدد";
    const trackingUrl = order.fulfillments?.[0]?.tracking_url || null;

    message = `🚚 تم شحن طلبك  
رقم الطلب: #${order.name}  
طريقة الشحن: ${order.shipping_lines?.[0]?.title || "عادي"}  
الناقل: ${trackingCompany}` +
      (trackingNumber ? `\n🔎 رقم التتبع: ${trackingNumber}` : "") +
      (trackingUrl ? `\n🔗 رابط التتبع: ${trackingUrl}` : "");
  }

  // 🔹 رسالة اكتمال الطلب (يشمل الرقمية والمادية بعد الدفع والشحن)
  if (status === "paid" && fulfillment === "fulfilled") {
    message = `🎉 تم اكتمال طلبك بنجاح  
رقم الطلب: #${order.name}  
طلبك مدفوع ومكتمل ✅  

شكرًا لتعاملك معنا ❤️  
ونتطلع لخدمتك مجددًا في eSelect 🌟`;
  }

  // ✉️ إرسال الرسالة الرئيسية (مع منع التكرار)
  if (message && shouldSend(orderId, status, fulfillment)) {
    await sendWhatsAppMessage(phone, message);
  } else if (message) {
    console.log("⚠️ تم تجاهل رسالة مكررة:", orderId, status, fulfillment);
  }

  // 🔑 المنتجات الرقمية (LikeCard) → ترسل عند تحديث الطلب + وجود ملاحظة
  if (topic === "orders/updated" && isDigital && order.note) {
    const digitalMsg = `🔑 تم إنشاء رمز الاسترداد لطلبك  

${order.note}`;
    await sendWhatsAppMessage(phone, digitalMsg);
  }

  res.status(200).send("OK");
});

// ✅ تشغيل السيرفر
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Service running on port ${PORT}`);
});
