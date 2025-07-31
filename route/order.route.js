import { Router } from 'express'
import auth from '../middleware/auth.js'
import { CashOnDeliveryOrderController, getOrderDetailsController, vnpayPaymentController, webhookVnpay } from '../controllers/order.controller.js'

const orderRouter = Router()

orderRouter.post("/cash-on-delivery",auth,CashOnDeliveryOrderController)
orderRouter.post('/checkout',auth,vnpayPaymentController)
orderRouter.post('/webhook',webhookVnpay)
orderRouter.get("/order-list",auth,getOrderDetailsController)

export default orderRouter