const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ✅ بيانات UlraMsg من Environment Variables
const INSTANCE_ID = process.env.ULTRA_INSTANCE;
const TOKEN = process.env.ULTRA_TOKEN;
const API_URL = `https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`;

// ✅ دالة إرسال واتساب
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

// ✅ منع التكرار (آخر حالة للطلب)
const lastStatusMap = new Map();
function shouldSend(key) {
  if (lastStatusMap.has(key)) {
    return false;
  }
  lastStatusMap.set(key, true);
  return true;
}

// ✅ Route اختبار
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Service up and running");
});

// ✅ Webhook
app.post("/whatsapp-webhook", async (req, res) => {
  const topic = req.headers["x-shopify-topic"];
  const order = req.body;
  let phone = order?.shipping_address?.phone || order?.billing_address?.phone;
  let message = "";

  if (!phone) {
    console.log("⚠️ لا يوجد رقم هاتف في الطلب");
    return res.status(200).send("No phone number");
  }

  const orderId = order.id || order.order_id || order.name;
  const status = order.financial_status || "pending";
  const fulfillment = order.fulfillment_status || "unfulfilled";
  const isDigital = order.line_items?.some(line =>
    line.product_type === "Digital" || line.title.includes("LikeCard")
  );

  // ========================
  // 1) إنشاء الطلب
  // ========================
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
حالة الطلب: ${fulfillment || "قيد المعالجة"}  
الدفع: ${status} عبر ${paymentMethod}`;
    }
  }

  // ========================
  // 2) تأكيد الدفع
  // ========================
  if (topic === "orders/paid") {
    const key = `paid-${orderId}`;
    if (shouldSend(key)) {
      message = `💳 تم تأكيد الدفع  
رقم الطلب: #${order.name}  
المنتج: ${order.line_items[0].title}  
المبلغ: ${order.total_price} ${order.currency}`;
    }
  }

  // ========================
  // 3) الشحن (Fulfillment created/updated) للمنتجات المادية فقط
  // ========================
  if ((topic === "fulfillments/create" || topic === "fulfillments/update") && !isDigital) {
    const trackingNumber = order.tracking_number || order.fulfillments?.[0]?.tracking_number || null;
    const trackingCompany = order.tracking_company || order.fulfillments?.[0]?.tracking_company || "غير محدد";
    const trackingUrl = order.tracking_url || order.fulfillments?.[0]?.tracking_url || null;
    const shippingTitle = order.line_items?.[0]?.fulfillment_service || order.shipping_lines?.[0]?.title || "عادي";

    const key = `ship-${orderId}-${trackingNumber || "no-track"}`;
    if (shouldSend(key)) {
      message = `🚚 تم شحن طلبك  
رقم الطلب: #${order.order_id || order.name}  
طريقة الشحن: ${shippingTitle}  
الناقل: ${trackingCompany}` +
        (trackingNumber ? `\n🔎 رقم التتبع: ${trackingNumber}` : "") +
        (trackingUrl ? `\n🔗 رابط التتبع: ${trackingUrl}` : "");
    }
  }

  // ========================
  // 4) اكتمال الطلب
  // ========================
  if (topic === "orders/fulfilled") {
    const key = `fulfilled-${orderId}`;
    if (shouldSend(key)) {
      message = `🎉 تم اكتمال طلبك  
رقم الطلب: #${order.name}  
طلبك مدفوع ومكتمل ✅  

شكرًا لتعاملك معنا ❤️  
ونتطلع لخدمتك مجددًا في eSelect 🌟`;
    }
  }

  // ========================
  // 5) تحديث الطلب (للسيريالات من LikeCard)
  // ========================
  if (topic === "orders/updated" && isDigital && order.note) {
    const key = `note-${orderId}-${order.updated_at}`;
    if (shouldSend(key)) {
      message = `🔑 تم إنشاء رمز الاسترداد لطلبك  

${order.note}`;
    }
  }

  // ========================
  // إرسال الرسالة إن وجدت
  // ========================
  if (message) {
    await sendWhatsAppMessage(phone, message);
  } else {
    console.log("ℹ️ لم يتم إرسال رسالة لهذه الحالة:", topic, orderId);
  }

  res.status(200).send("OK");
});

// ✅ تشغيل السيرفر
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Service running on port ${PORT}`);
});
