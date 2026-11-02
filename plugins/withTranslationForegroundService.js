const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withTranslationForegroundService(config) {
  config = withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    const permissions = manifest['uses-permission'] || [];
    const addPermission = name => {
      if (!permissions.some(p => p.$?.['android:name'] === name)) {
        permissions.push({ $: { 'android:name': name } });
      }
    };
    addPermission('android.permission.FOREGROUND_SERVICE');
    addPermission('android.permission.WAKE_LOCK');
    addPermission('android.permission.FOREGROUND_SERVICE_DATA_SYNC');
    addPermission('android.permission.POST_NOTIFICATIONS');
    manifest['uses-permission'] = permissions;

    const app = manifest.application?.[0];
    if (app) {
      app.service = app.service || [];
      const serviceName = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';
      let service = app.service.find(s => s.$?.['android:name'] === serviceName);
      if (!service) {
        service = { $: { 'android:name': serviceName } };
        app.service.push(service);
      }
      service.$['android:foregroundServiceType'] = 'dataSync';
      service.$['android:exported'] = 'false';
    }
    return config;
  });

  // Android 14+ blocks mutable PendingIntents created from implicit Intents.
  // Give the notification tap Intent this app as its explicit target.
  config = withDangerousMod(config, ['android', async config => {
    const javaFile = path.join(
      config.modRequest.projectRoot,
      'node_modules',
      'react-native-background-actions',
      'android',
      'src',
      'main',
      'java',
      'com',
      'asterinet',
      'react',
      'bgactions',
      'RNBackgroundActionsTask.java'
    );
    if (!fs.existsSync(javaFile)) {
      throw new Error('Android background-actions source file not found: ' + javaFile);
    }

    let source = fs.readFileSync(javaFile, 'utf8');
    const alreadyPatched = /notificationIntent\.setPackage\(context\.getPackageName\(\)\)\s*;/.test(source);
    if (!alreadyPatched) {
      // Match the declaration regardless of indentation or surrounding formatting.
      const declaration = /(^[ \t]*final[ \t]+PendingIntent[ \t]+contentIntent[ \t]*;)/m;
      if (!declaration.test(source)) {
        throw new Error('Found RNBackgroundActionsTask.java, but could not identify the contentIntent declaration. No unsafe partial patch was applied.');
      }
      source = source.replace(
        declaration,
        '        // Explicit package avoids Android 14+ mutable implicit PendingIntent rejection.\n' +
        '        notificationIntent.setPackage(context.getPackageName());\n' +
        '$1'
      );
      fs.writeFileSync(javaFile, source, 'utf8');
    }
    return config;
  }]);

  return config;
};
