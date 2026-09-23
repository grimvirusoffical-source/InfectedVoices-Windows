(function () {
  var report = Object.freeze({
    ready: false,
    signedChannel: 'unprovisioned',
    storeManaged: false,
    message: 'Windows update channel is UNPROVISIONED. This shell does not contact an update server and does not download a replacement build.'
  });
  function check() {
    return Promise.resolve(report);
  }
  window.ivDesktop = Object.freeze({
    version: '0.7.0',
    platform: 'windows',
    channel: 'unprovisioned',
    corePin: '__CORE_PIN__',
    checkUpdates: check,
    checkForUpdates: check
  });
})();
