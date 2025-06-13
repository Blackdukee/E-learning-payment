const router = require("express").Router();
const {
  mockAuthMiddleware,
  validateToken,
  requireRole,
} = require("../middleware/auth");
const accountController = require("../controllers/accountController");

router.use(
  process.env.NODE_ENV === "development" ? mockAuthMiddleware() : validateToken,
  requireRole("Educator")
);

// Get educator stripe account login link
router.get("/stripe-account", accountController.stripeAccount);

// Post create stripe account for educator
router.post("/create-account", accountController.createEducatorAccount);

// Delete stripe account for educator
router.delete("/delete-account", accountController.deleteEducatorAccount);

module.exports = router;
