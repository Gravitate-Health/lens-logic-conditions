const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

global.html = fs.readFileSync(path.join(__dirname, "../data/html.html"), "utf-8");
global.epi = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/epi.json")));
global.ips = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/ips.json")));
global.pv = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/pv.json")));

const dom = new JSDOM(global.html);
global.window = dom.window;
global.document = dom.window.document;

describe("Conditions Lens Script", () => {
  function getBaseIPS() {
    return JSON.parse(JSON.stringify(global.ips));
  }

  let annotation;
  beforeEach(() => {
    const scriptContent = fs.readFileSync(path.join(__dirname, "../conditions-lens.js"), "utf-8");
    const context = {
      console,
      window,
      document,
      html: global.html,
      epi: global.epi,
      ips: global.ips,
      pv: {},
      require,
      module: {},
      exports: {},
    };
    vm.createContext(context);
    const wrappedScript = `(function() {\n${scriptContent}\n})();`;
    annotation = vm.runInContext(wrappedScript, context);
  });

  test("should return version string", () => {
    expect(annotation.getSpecification()).toBe("1.0.0");
  });

  test("should return explanation and report for no conditions", async () => {
    // Remove all conditions from IPS
    const ips = getBaseIPS();
    ips.entry = ips.entry.filter(e => e.resource.resourceType !== "Condition");
    const context = { ...global, ips };
    vm.createContext(context);
    const scriptContent = fs.readFileSync(path.join(__dirname, "../conditions-lens.js"), "utf-8");
    const wrappedScript = `(function() {\n${scriptContent}\n})();`;
    const annotation = vm.runInContext(wrappedScript, context);
    await annotation.enhance();
    const explanation = await annotation.explanation("en");
    expect(typeof explanation).toBe("string");
    expect(explanation).toMatch(/no conditions/i);
    const report = await annotation.report("en");
    expect(report.message).toMatch(/no relevant/i);
    expect(report.conditions.length).toBe(0);
  });

  test("should return explanation and report for one condition", async () => {
    // Add a single condition
    const ips = getBaseIPS();
    ips.entry = ips.entry.filter(e => e.resource.resourceType !== "Condition");
    ips.entry.push({
      resource: {
        resourceType: "Condition",
        code: {
          coding: [{ code: "C001", system: "http://snomed.info/sct" }],
          text: "Diabetes"
        }
      }
    });
    const context = { ...global, ips };
    vm.createContext(context);
    const scriptContent = fs.readFileSync(path.join(__dirname, "../conditions-lens.js"), "utf-8");
    const wrappedScript = `(function() {\n${scriptContent}\n})();`;
    const annotation = vm.runInContext(wrappedScript, context);
    await annotation.enhance();
    const explanation = await annotation.explanation("en");
    expect(typeof explanation).toBe("string");
    expect(explanation).toMatch(/diabetes/i);
    const report = await annotation.report("en");
    expect(report.conditions).toContain("Diabetes");
    expect(report.message).toMatch(/diabetes/i);
  });

  test("should return explanation and report for multiple conditions", async () => {
    // Add multiple conditions
    const ips = getBaseIPS();
    ips.entry = ips.entry.filter(e => e.resource.resourceType !== "Condition");
    ips.entry.push({
      resource: {
        resourceType: "Condition",
        code: {
          coding: [{ code: "C001", system: "http://snomed.info/sct" }],
          text: "Diabetes"
        }
      }
    });
    ips.entry.push({
      resource: {
        resourceType: "Condition",
        code: {
          coding: [{ code: "C002", system: "http://snomed.info/sct" }],
          text: "Hypertension"
        }
      }
    });
    const context = { ...global, ips };
    vm.createContext(context);
    const scriptContent = fs.readFileSync(path.join(__dirname, "../conditions-lens.js"), "utf-8");
    const wrappedScript = `(function() {\n${scriptContent}\n})();`;
    const annotation = vm.runInContext(wrappedScript, context);
    await annotation.enhance();
    const explanation = await annotation.explanation("en");
    expect(typeof explanation).toBe("string");
    expect(explanation).toMatch(/diabetes.*hypertension|hypertension.*diabetes/i);
    const report = await annotation.report("en");
    expect(report.conditions).toEqual(expect.arrayContaining(["Diabetes", "Hypertension"]));
    expect(report.message).toMatch(/diabetes.*hypertension|hypertension.*diabetes/i);
  });
});
