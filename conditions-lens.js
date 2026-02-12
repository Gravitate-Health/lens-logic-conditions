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
        report: (conditions) => conditions.length
            ? `You are seeing this because you have: ${conditions.join(", ")}.`
            : "No relevant conditions detected.",
        explanation: (conditions) => conditions.length
            ? `The following conditions were detected and highlighted: ${conditions.join(", ")}.`
            : "No conditions found in your health record."
    },
    es: {
        report: (conditions) => conditions.length
            ? `Ves esto porque tienes: ${conditions.join(", ")}.`
            : "No se detectaron condiciones relevantes.",
        explanation: (conditions) => conditions.length
            ? `Se detectaron y resaltaron las siguientes condiciones: ${conditions.join(", ")}.`
            : "No se encontraron condiciones en su historial de salud."
    },
    pt: {
        report: (conditions) => conditions.length
            ? `Você está vendo isso porque tem: ${conditions.join(", ")}.`
            : "Nenhuma condição relevante detectada.",
        explanation: (conditions) => conditions.length
            ? `As seguintes condições foram detectadas e destacadas: ${conditions.join(", ")}.`
            : "Nenhuma condição encontrada no seu histórico de saúde."
    },
    da: {
        report: (conditions) => conditions.length
            ? `Du ser dette, fordi du har: ${conditions.join(", ")}.`
            : "Ingen relevante tilstande fundet.",
        explanation: (conditions) => conditions.length
            ? `Følgende tilstande blev fundet og fremhævet: ${conditions.join(", ")}.`
            : "Ingen tilstande fundet i din journal."
    }
};

let detectedConditions = [];

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
    // Iterates through the IPS entry searching for conditions
    ips.entry.forEach((element) => {
        if (element.resource.resourceType == "Condition") {
            if (element.resource.code != undefined) {
                element.resource.code.coding.forEach((coding) => {
                    arrayOfConditionCodes.push({
                        code: coding.code,
                        system: coding.system,
                    });
                });
                // Try to get the display name for the condition
                if (element.resource.code.text) {
                    detectedConditions.push(element.resource.code.text);
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
        status: ""
    };
};

return {
    enhance: enhance,
    getSpecification: getSpecification,
    explanation: explanationfunction,
    report: reportfunction
};
