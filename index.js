require("dotenv").config({ path: __dirname + "/.env" });
const fs = require("fs");
const puppeteer = require("puppeteer");

const JOB_LISTINGS_URL =
  "https://www.indeed.com/jobs?q=frontend+engineer&l=New+York%2C+NY&from=searchOnHP&vjk=3471e5d39897e1d9";

const POSTING_CLICK_DELAY = Math.floor(Math.random() * 600) + 700;
const NEXT_PAGE_CLICK_DELAY = Math.floor(Math.random() * 1000) + 500;

// Main function
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
  });

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(0);

  await Promise.all([
    page.setViewport({ width: 1440, height: 1000 }),
    page.goto(JOB_LISTINGS_URL),
  ]);

  // Scrape
  console.log("Initate scraping");
  const [validPostings] = await scrapePostings(browser, page, textExtractor);

  console.log("validPostings: ", validPostings);

  const formattedPostings = validPostings.map((post) => {
    const {
      experienceMet,
      experienceRequired,
      company,
      title,
      location,
      datePosted,
      url,
      connections,
    } = post;

    return `${experienceMet}\t${experienceRequired}\t${company}\t${title}\t${location}\t${datePosted}\t${url}\t${connections}`;
  });

  // Print Results
  fs.writeFile("./output.txt", formattedPostings.join("\n"), (e) => {
    if (e) return console.log(e);
    console.log("File successfully written");
  });
})();

// Filters job postings to exclude invalid job postings. Checks for years of experience required
function experienceFilter(description) {
  const pattern = new RegExp(
    /\d+\+ years|\d+ years|[1-9] to [1-9] years|[1-9]-[1-9] years|[1-9]-[1-9] \+ years|[1-9] \+ years|years of experience|yrs of experience/i
  );
  const yearsPattern = new RegExp(
    /(\d+)\+ years|(\d+) years|([1-9]) to [1-9] years|([1-9])-[1-9] years|([1-9])-[1-9] \+ years|([1-9]) \+ years|(\d+).+years/i
  );

  const metMinimum = !pattern.test(description);
  let minimumYears = 0;

  if (!metMinimum && description.match(yearsPattern) !== null) {
    const [yearsMin] = [...description.match(yearsPattern)].filter(
      (match) => match && match.length == 1
    );

    minimumYears = parseInt(yearsMin);
  }

  return [metMinimum, minimumYears];
}

// Extracts all the relevant information from a job posting
async function textExtractor() {
  function dateConverter(string) {
    if (/today/.test(string)) {
      return new Date().toLocaleDateString();
    } else if (/day/.test(string)) {
      const [daysAgo] = string.match(/\d+/);
      const dt = new Date();
      dt.setDate(dt.getDate() - parseInt(daysAgo));
      return dt.toLocaleDateString();
    }
  }

  let company = document.querySelector(".css-1saizt3.e1wnkr790");
  if (company) company = company.innerText.trim();

  let location = document.querySelector(".css-6z8o9s.eu4oa1w0");
  if (location) location = location.innerText.trim();

  const sincePosted = document
    .querySelector(".css-5vsc1i.eu4oa1w0")
    .innerText.trim();

  const datePosted = dateConverter(sincePosted);

  const title = document
    .querySelector(
      ".icl-u-xs-mb--xs.icl-u-xs-mt--none.jobsearch-JobInfoHeader-title.is-embedded span"
    )
    .innerText.split("\n-")[0];

  const url = document.querySelector(".jobTitle > a").href;

  const description = document
    .querySelector("#jobDescriptionText")
    .innerText.replace(new RegExp(/\n+/g), " ");

  return [company, location, datePosted, title, url, description];
}

// Grabs the unique posting ID of each job listing
function grabPostingsIDs() {
  return [...document.querySelector(".jobsearch-ResultsList.css-0").children]
    .map(
      (li) =>
        li.children[0].className
          .split(" ")
          .filter((classname) => classname.includes("job"))[0]
    )
    .filter((jobID) => jobID !== undefined);
}

// Scrolls all the way down to the bottom of the page
function scrollToBottom() {
  const scrollDistance = document.querySelector(".jobsearch-LeftPane");
  window.scrollBy({ top: scrollDistance, behavior: "smooth" });
}

// Filters a given string to exclude senior roles
function titleFilter(title) {
  // Includes
  const test1 = /front|ui|web developer/i.test(title);
  // Doesn't Include
  const test2 =
    !/senior|founding|staff|sr|lead|mid|angular|vue|iii|years|java[^s]|full/i.test(
      title
    );

  return [test1, test2].every((test) => test === true);
}

// Main scraping function that scrapes each posting for data
async function scrapePostings(browser, page, textExtractor) {
  const validPostings = [];
  const postingDescriptions = [];

  try {
    let isNextPageAvailable = await page.evaluate(() => {
      return !!document.querySelector("a[data-testid='pagination-page-next']");
    });

    while (isNextPageAvailable) {
      const postingsArray = await page.evaluate(grabPostingsIDs);

      await page.evaluate(scrollToBottom);
      await page.waitForTimeout(Math.random() * 800 + 1000);

      console.log(postingsArray);

      for (let jobID of postingsArray) {
        const jobTitle = await page.evaluate((id) => {
          return document.querySelector(`.${id} H2`).innerText;
        });

        // If it fails the job title checker (Senior role)
        if (!titleFilter(jobTitle)) {
          // Jump to the next iteration
          continue;
        }

        await Promise.all([
          page.click(".job_36ac8b31f605d700"),
          page.waitForSelector("#jobsearch-ViewjobPaneWrapper", {
            visible: true,
          }),
        ]);

        await page.waitForTimeout(POSTING_CLICK_DELAY);

        const [company, location, datePosted, title, url, description] =
          await page.evaluate(textExtractor);

        validPostings.push({
          experienceMet: experienceFilter(description)[0] ? "yes" : "no",
          experienceRequired: experienceFilter(description)[1],
          company,
          title,
          location,
          datePosted,
          url,
          connections: availableAlumni ? "yes" : "no",
        });
      }

      // Jump to the next page
      await Promise.all([
        page.click("a[data-testid='pagination-page-next']"),
        page.waitForNavigation(),
        page.waitForTimeout(NEXT_PAGE_CLICK_DELAY),
      ]);

      // Reassign this boolean for the next iteration
      isNextPageAvailable = await page.evaluate(() => {
        return !!document.querySelector(
          "a[data-testid='pagination-page-next']"
        );
      });
    }
  } catch (e) {
    console.log(e);
  }
}
