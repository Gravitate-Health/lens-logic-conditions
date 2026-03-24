let pvData = pv;
let htmlData = html;

let epiData = epi;
let ipsData = ips;

let getSpecification = () => {
    return "1.0.0";
};

// --- Language dictionary for user-facing messages ---
const languageDict = {
    en: {
        report: (conditions) => {
            if (!conditions.length) return "No relevant conditions detected.";
            const condStr = conditions.length === 1
                ? `"${conditions[0]}"`
                : conditions.map(c => `"${c}"`).join(" and ");
            return `This part was highlighted because you have a record of a diagnosis of ${condStr}.`;
        },
        explanation: (conditions) => {
            if (!conditions.length) return "No conditions found in your health record.";
            const condStr = conditions.length === 1
                ? `"${conditions[0]}"`
                : conditions.map(c => `"${c}"`).join(" and ");
            return `This part was highlighted because you have a record of a diagnosis of ${condStr}.`;
        }
    },
    es: {
        report: (conditions) => {
            if (!conditions.length) return "No se detectaron condiciones relevantes.";
            const condStr = conditions.map(c => `"${c}"`).join(" y ");
            return `Esta parte fue resaltada porque tiene un registro de diagnóstico de ${condStr}.`;
        },
        explanation: (conditions) => {
            if (!conditions.length) return "No se encontraron condiciones en su historial de salud.";
            const condStr = conditions.map(c => `"${c}"`).join(" y ");
            return `Esta parte fue resaltada porque tiene un registro de diagnóstico de ${condStr}.`;
        }
    },
    pt: {
        report: (conditions) => {
            if (!conditions.length) return "Nenhuma condição relevante detectada.";
            const condStr = conditions.map(c => `"${c}"`).join(" e ");
            return `Esta parte foi destacada porque tem um registo de diagnóstico de ${condStr}.`;
        },
        explanation: (conditions) => {
            if (!conditions.length) return "Nenhuma condição encontrada no seu histórico de saúde.";
            const condStr = conditions.map(c => `"${c}"`).join(" e ");
            return `Esta parte foi destacada porque tem um registo de diagnóstico de ${condStr}.`;
        }
    },
    da: {
        report: (conditions) => {
            if (!conditions.length) return "Ingen relevante tilstande fundet.";
            const condStr = conditions.map(c => `"${c}"`).join(" og ");
            return `Denne del er fremhævet, fordi du har en registreret diagnose af ${condStr}.`;
        },
        explanation: (conditions) => {
            if (!conditions.length) return "Ingen tilstande fundet i din journal.";
            const condStr = conditions.map(c => `"${c}"`).join(" og ");
            return `Denne del er fremhævet, fordi du har en registreret diagnose af ${condStr}.`;
        }
    }
};

let detectedConditions = [];
let matchedCategories = [];

let enhance = async () => {
    // --- Language detection from ePI ---
    let languageDetected = null;
    if (epi && epi.entry) {
        epi.entry.forEach((entry) => {
            const res = entry.resource;
            if (res?.resourceType === "Composition" && res.language) {
                languageDetected = res.language;
                console.log("🌍 Detected from Composition.language:", languageDetected);
            }
        });
    }
    if (!languageDetected && epi && epi.language) {
        languageDetected = epi.language;
        console.log("🌍 Detected from Bundle.language:", languageDetected);
    }
    if (!languageDetected) {
        console.warn("⚠️ No language detected in Composition or Bundle.");
    }
    // Proves that IPS exists
    if (ips == "" || ips == null) {
        throw new Error("Failed to load IPS: the LEE is getting a empty IPS");
    }
    // Instantiates the array of condition codes
    let arrayOfConditionCodes = [];
    detectedConditions = [];
    matchedCategories = [];
    // Iterates through the IPS entry searching for conditions
    ips.entry.forEach((element) => {
        if (element.resource.resourceType == "Condition") {
            if (element.resource.code != undefined) {
                let displayName = element.resource.code.text;
                element.resource.code.coding.forEach((coding) => {
                    arrayOfConditionCodes.push({
                        code: coding.code,
                        system: coding.system,
                    });
                    // Fallback to coding.display if no code.text
                    if (!displayName && coding.display) {
                        displayName = coding.display;
                    }
                });
                // Last resort: use the first code value
                if (!displayName && element.resource.code.coding.length > 0) {
                    displayName = element.resource.code.coding[0].code;
                }
                if (displayName) {
                    detectedConditions.push(displayName);
                }
            }
        }
    });
    // If there are no conditions, return the ePI as it is
    if (arrayOfConditionCodes.length == 0) {
        return htmlData;
    }
    // ePI translation from terminology codes to their human readable translations in the sections
    let compositions = 0;
    let categories = [];
    epi.entry.forEach((entry) => {
        if (entry.resource.resourceType == "Composition") {
            compositions++;
            entry.resource.extension.forEach((element) => {
                if (element.extension[1].url == "concept") {
                    if (element.extension[1].valueCodeableReference.concept != undefined) {
                        element.extension[1].valueCodeableReference.concept.coding.forEach(
                            (coding) => {
                                if (equals(arrayOfConditionCodes, { code: coding.code, system: coding.system })) {
                                    categories.push(element.extension[0].valueString);
                                }
                            }
                        );
                    }
                }
            });
        }
    });
    if (compositions == 0) {
        throw new Error('Bad ePI: no category "Composition" found');
    }
    if (categories.length == 0) {
        return htmlData;
    }
    matchedCategories = [...categories];
    // Focus (adds highlight class) the html applying every category found
    return await annotateHTMLsection(categories, "highlight");
};

let annotationProcess = (listOfCategories, enhanceTag, document, response) => {
    listOfCategories.forEach((check) => {
        if (response.includes(check)) {
            let elements = document.getElementsByClassName(check);
            for (let i = 0; i < elements.length; i++) {
                elements[i].classList.add(enhanceTag);
                elements[i].classList.add("conditions-lens");
            }
            if (document.getElementsByTagName("head").length > 0) {
                document.getElementsByTagName("head")[0].remove();
            }
            if (document.getElementsByTagName("body").length > 0) {
                response = document.getElementsByTagName("body")[0].innerHTML;
                console.log("Response: " + response);
            } else {
                console.log("Response: " + document.documentElement.innerHTML);
                response = document.documentElement.innerHTML;
            }
        }
    });

    if (response == null || response == "") {
        throw new Error(
            "Annotation proccess failed: Returned empty or null response"
        );
        //return htmlData
    } else {
        console.log("Response: " + response);
        return response;
    }
}

let annotateHTMLsection = async (listOfCategories, enhanceTag) => {
    let response = htmlData;
    let document;

    if (typeof window === "undefined") {
        let jsdom = await import("jsdom");
        let { JSDOM } = jsdom;
        let dom = new JSDOM(htmlData);
        document = dom.window.document;
        return annotationProcess(listOfCategories, enhanceTag, document, response);
    } else {
        document = window.document;
        return annotationProcess(listOfCategories, enhanceTag, document, response);
    }
};

let equals = (array, object) => {
    return array.some((element) => {
        return (element.code === object.code) && (element.system === object.system);
    });
}

let getLanguageMessages = (lang = "en") => {
    const normalizedLang = (lang || "en").toLowerCase();
    if (languageDict[normalizedLang]) {
        return languageDict[normalizedLang];
    }

    const baseLang = normalizedLang.split("-")[0];
    return languageDict[baseLang] || languageDict.en;
};

let explanationfunction = async (lang = "en") => {
    const messages = getLanguageMessages(lang);
    return messages.explanation(detectedConditions);
};

let reportfunction = async (lang = "en") => {
    const messages = getLanguageMessages(lang);
    return {
        message: messages.report(detectedConditions),
        conditions: [...detectedConditions],
        sections: [...matchedCategories],
        status: ""
    };
};

return {
    enhance: enhance,
    getSpecification: getSpecification,
    explanation: explanationfunction,
    report: reportfunction
};
