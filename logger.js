const { createLogger, format, transports } = require("winston");
const util = require("util");

const { blue, red, yellow, green, magenta } = require("colorette");

const colorizeLevel = (level) => {
  switch (level) {
    case "ERROR":
      return red(level);
    case "INFO":
      return blue(level);
    case "WARN":
      return yellow(level);
    default:
      return level;
  }
};

const consoleLogFormat = format.printf((info) => {
  const { timestamp, level, message, meta = {} } = info;
  const customLevel = colorizeLevel(level.toUpperCase());
  const customTimeStamp = green(timestamp);
  const customMessage = message;
  const customMeta = util.inspect(meta, {
    showHidden: false,
    depth: null,
    colors: true,
  });

  const customLog = `${customLevel} [${customTimeStamp}] ${customMessage}\n ${magenta(
    `META`
  )} ${customMeta}`;
  return customLog;
});

const consoleTransport = () => {
  return [
    new transports.Console({
      level: "info",
      format: format.combine(format.timestamp(), consoleLogFormat),
    }),
  ];
};

module.exports = createLogger({
  defaultMeta: {
    meta: {},
  },
  transports: [...consoleTransport()],
});
