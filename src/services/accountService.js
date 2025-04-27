const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const prisma = require("../config/db");
const { logger, auditLogger } = require("../utils/logger");
const { AppError } = require("../middleware/errorHandler");

const stripeAccount = async (req) => {
  try {
    // Check if the educator has a Stripe account
    const educatorStripeAccount = await prisma.stripeAccount.findFirst({
      where: { educatorId: req.user.id },
    });

    if (!educatorStripeAccount) {
      throw new AppError("Educator Stripe account not found", 404);
    }

    // Create a login link for the educator to access their Stripe dashboard
    const loginLink = await stripe.accounts.createLoginLink(
      educatorStripeAccount.stripeAccountId,
      {
        redirect_url: `${process.env.FRONT_END_URL}/educator/stripe-account`,
      }
    );

    return loginLink;
  } catch (error) {
    logger.error(`Error creating Stripe account link: ${error.message}`, {
      error,
    });
    throw new AppError(
      `Error creating Stripe account link: ${error.message}`,
      400
    );
  }
};

const createEducatorStripeAccount = async (req) => {
  try {
    // Ensure the educator isn’t already onboarded
    const existingAccount = await prisma.stripeAccount.findFirst({
      where: { educatorId: req.user.id },
    });
    if (existingAccount) {
      throw new AppError("Educator already has a Stripe account", 400);
    }

    // Create the Stripe Connect Custom account
    // const account = await stripe.accounts.create({
    //   type: "custom",
    //   country: "US",
    //   email: req.body.email,
    //   capabilities: {
    //     card_payments: { requested: true },
    //     transfers: { requested: true },
    //   },
    //   business_type: "individual",
    //   individual: {
    //     first_name: req.body.first_name,
    //     last_name: req.body.last_name,
    //     email: "test@example.com",
    //     phone: "+18885551234",
    //     address: {
    //       line1: "123 Test St",
    //       city: "San Francisco",
    //       state: "CA",
    //       postal_code: "94103",
    //       country: "US",
    //     },
    //     dob: {
    //       day: 15,
    //       month: 6,
    //       year: 1985,
    //     },
    //     ssn_last_4: "0000",
    //   },
    //   business_profile: {
    //     mcc: "8299", // Education services
    //     product_description: "Online education",
    //   },
    //   company: {
    //     name: `${req.body.first_name} ${req.body.last_name}`,
    //     tax_id: "000000000", // Use "000000000" for test purposes
    //   },
    //   tos_acceptance: {
    //     service_agreement: "full",
    //     date: Math.floor(Date.now() / 1000),
    //     ip: req.ip,
    //   },
    // });

    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: req.user.email,
    });

    // Create Stripe express account
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONT_END_URL}/educator/stripe-account?refresh=true`,
      return_url: `${process.env.FRONT_END_URL}/educator/stripe-account?success=true`,
      type: "account_onboarding",
    });

    // const bank_account = await stripe.accounts.createExternalAccount(
    //   account.id,
    //   {
    //     external_account: {
    //       object: "bank_account",
    //       country: "US",
    //       currency: "usd",
    //       routing_number: "110000000",
    //       account_number: "000123456789",
    //     },
    //   }
    // );

    // const educatorStripeAccount = await prisma.stripeAccount.create({
    //   data: {
    //     educatorId: req.user.id,
    //     email: req.body.email,
    //     stripeAccountId: account.id,
    //     stripeBankAccount: bank_account.id,
    //   },
    // });
    
    // create a new Stripe account in the database
    await prisma.stripeAccount.create({
      data: {
        educatorId: req.user.id,
        email: req.user.email,
        stripeAccountId: account.id,
      },
    });
    
    auditLogger.log(
      "STRIPE_ACCOUNT_CREATED",
      req.user.id,
      `Stripe Connect account created for educator ${req.user.id}`,
      null,
      { accountId: account.id }
    );

    return accountLink;
  } catch (error) {
    logger.error(
      `Error creating Stripe account: ${error.message} , ${error.stack}`,
      {
        error,
      }
    );
    if (
      error.type === "StripePermissionError" ||
      error.message.includes("Connect")
    ) {
      throw new AppError(
        "To create Stripe Connect accounts, you need to sign up for Stripe Connect first. Learn more: https://stripe.com/docs/connect",
        400
      );
    }
    throw new AppError(`Error creating Stripe account: ${error.message}`, 400);
  }
};

const deleteEducatorStripeAccount = async (req, account) => {
  try {
    const educatorId = req.user.id;
    const educatorStripeAccount = await prisma.stripeAccount.findFirst({
      where: { educatorId },
    });

    if (!educatorStripeAccount) {
      throw new AppError("Educator Stripe account not found", 404);
    }

    // Delete the Stripe account
    await stripe.accounts.del(account);

    // Delete the local Stripe account record
    await prisma.stripeAccount.delete({
      where: { educatorId },
    });

    auditLogger.log(
      "STRIPE_ACCOUNT_DELETED",
      educatorId,
      `Stripe Connect account deleted for educator ${educatorId}`,
      null,
      { accountId: account }
    );
  } catch (error) {
    logger.error(`Error deleting educator account: ${error.message}`, {
      error,
    });
    throw new AppError(
      `Error deleting educator account: ${error.message}`,
      400
    );
  }
};

module.exports = {
  createEducatorStripeAccount,
  deleteEducatorStripeAccount,
  stripeAccount,
};
