const router = require("express").Router();
const {
  mockEducatorAuthMiddleware,
  validateToken,
} = require("../middleware/auth");
const accountController = require("../controllers/accountController");

router.get(
  "/stripe-account",
  process.env.NODE_ENV === 'development' ? mockEducatorAuthMiddleware : validateToken,
  accountController.stripeAccount
);
// Post create stripe account for educator
router.post(
  "/create-account",
  process.env.NODE_ENV === 'development' ? mockEducatorAuthMiddleware : validateToken,
  accountController.createEducatorAccount
);

// Delete stripe account for educator
router.delete(
  "/delete-account",
  process.env.NODE_ENV === 'development' ? mockEducatorAuthMiddleware : validateToken,
  accountController.deleteEducatorAccount
);


module.exports = router;