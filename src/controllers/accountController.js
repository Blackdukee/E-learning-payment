require("dotenv").config();
const accountService = require("../services/accountService");
const { logger } = require("../utils/logger");
const AppError = require("../middleware/errorHandler");
const prisma = require("../config/db");
const stripe = require("../config/stripe");

/**
 * @swagger
 * /educator/stripe-account:
 *   get:
 *     summary: Retrieve Stripe dashboard login link for educator
 *     tags: [Educators]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Login link created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 url:
 *                   type: string
 *                   example: "https://dashboard.stripe.com/login/abcdefg"
 *       404:
 *         description: Stripe account not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Stripe account not found"
 *       500:
 *         description: Server error
 */
const stripeAccount = async (req, res, next) => {
  try {
    const loginLink = await accountService.stripeAccount(req);
    res.status(200).json({
      success: true,
      url: loginLink.url,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /educator/create-account:
 *   post:
 *     summary: Create Stripe account for educator
 *     tags: [Educators]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '201':
 *         description: Account created
 */
const createEducatorAccount = async (req, res, next) => {
  try {
    const accountLink = await accountService.createEducatorStripeAccount(req);
    if (!accountLink) {
      return res.status(400).json({
        success: false,
        message: "Failed to create Stripe account",
      });
    }
    res.status(201).json({
      success: true,
      url: accountLink.url,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /educator/delete-account:
 *   delete:
 *     summary: Delete Stripe account for educator
 *     tags: [Educators]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Account deleted
 */
const deleteEducatorAccount = async (req, res, next) => {
  try {
    const { account } = await prisma.stripeAccount.findFirst({
      where: {
        educatorId: req.user.id,
      },
    });
    const result = await accountService.deleteEducatorStripeAccount(
      req,
      account
    );
    res.status(200).json({
      success: true,
      message: "Stripe account deleted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createEducatorAccount,
  deleteEducatorAccount,
  stripeAccount,
};
