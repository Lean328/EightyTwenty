/**
 * The Square SDK ships its helper frameworks nested inside SquareInAppPaymentsSDK.framework,
 * plus a `setup` script that moves them out, deletes itself and re-signs. Its config plugin adds
 * that script as a build phase during prebuild, but CocoaPods appends "[CP] Embed Pods
 * Frameworks" later (pod install), so the script ran before Square was in the app, found nothing
 * and App Store Connect rejected build 6 (ITMS-90035/90205/90206). This moves the phase to the
 * end of the app target once CocoaPods has integrated the project.
 */
const { withPodfile } = require('expo/config-plugins');

const MARKER = '# withSquareSetupAfterEmbed';
const HOOK = `
${MARKER}: run Square's setup after "[CP] Embed Pods Frameworks"
post_integrate do |installer|
  installer.aggregate_targets.map(&:user_project).compact.uniq(&:path).each do |project|
    moved = false
    project.native_targets.each do |target|
      setup = target.shell_script_build_phases.find { |phase| phase.name == '[CP] Square In-App Payments SDK Setup' }
      next unless setup && target.build_phases.last != setup
      target.build_phases.delete(setup)
      target.build_phases << setup
      moved = true
    end
    project.save if moved
  end
end
`;

module.exports = (config) =>
  withPodfile(config, (mod) => {
    if (!mod.modResults.contents.includes(MARKER)) mod.modResults.contents += HOOK;
    return mod;
  });
