const axios = require("axios");
const { logger } = require("./logger");

/**
 * Send notification to user service
 */
const notifyUserService = async (data) => {
  try {
    if (process.env.NODE_ENV === "development") {
      logger.info(
        `Skipping user service notification in development mode: ${data.action} for user ${data.userId}`
      );
      return;
    }
    if (!process.env.USER_SERVICE_URL) {
      logger.warn("USER_SERVICE_URL not set. Notification not sent.");
      return;
    }

    await axios.post(`${process.env.USER_SERVICE_URL}/notifications`, data, {
      headers: {
        "Content-Type": "application/json",
        "X-Service-Auth": process.env.INTERNAL_API_KEY,
      },
    });

    logger.info(
      `User service notified: ${data.action} for user ${data.userId}`
    );
  } catch (error) {
    logger.error(`Failed to notify user service: ${error.message}`, {
      error,
      data,
    });
    // Fail silently - don't break the main flow
  }
};

/**
 * Send notification to course service
 */
const notifyCourseService = async (data) => {
  try {
    if (process.env.NODE_ENV === "development") {
      logger.info(
        `Skipping user service notification in development mode: ${data.action} for user ${data.userId}`
      );
      return;
    }
    if (!process.env.COURSE_SERVICE_URL) {
      logger.warn("COURSE_SERVICE_URL not set. Notification not sent.");
      return;
    }

    await axios.post(
      `${process.env.COURSE_SERVICE_URL}/course/notifications`,
      data,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Service-Auth": process.env.INTERNAL_API_KEY,
        },
      }
    );

    logger.info(
      `Course service notified: ${data.action} for course ${data.courseId}`
    );
  } catch (error) {
    logger.error(`Failed to notify course service: ${error.message}`, {
      error,
      data,
    });
    // Fail silently - don't break the main flow
  }
};

const notifyProgressService = async (data) => {
  try {
    if (process.env.NODE_ENV === "development") {
      logger.info(
        `Skipping user service notification in development mode: ${data.action} for user ${data.userId}`
      );
      return;
    }
    if (!process.env.PROGRESS_SERVICE_URL) {
      logger.warn("PROGRESS_SERVICE_URL not set. Notification not sent.");
      return;
    }

    await axios.post(
      `${process.env.PROGRESS_SERVICE_URL}/progress/webhook/enrollment-updated`,
      data,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Service-Auth": process.env.INTERNAL_API_KEY,
        },
      }
    );

    logger.info(
      `Progress service notified: ${data.action} for user ${data.userId}`
    );
  } catch (error) {
    logger.error(`Failed to notify progress service: ${error.message}`, {
      error,
      data,
    });
  }
};

module.exports = {
  notifyUserService,
  notifyCourseService,
  notifyProgressService,
};
