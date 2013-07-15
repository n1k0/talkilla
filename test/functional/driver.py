# -*- coding: utf-8 -*-

import os

from selenium.webdriver.remote.webdriver import WebDriver

SELENIUM_COMMAND_EXECUTOR = os.getenv("SELENIUM_COMMAND_EXECUTOR",
                                      "http://127.0.0.1:4444/wd/hub")

MS_PER_SEC = 1000

class Driver(WebDriver):
    nick = None

    def __init__(self, *args, **kwargs):
        if "nick" in kwargs and kwargs["nick"] is not None:
            self.nick = kwargs["nick"]
        del kwargs["nick"]
        super(Driver, self).__init__(*args, **kwargs)

    def signin(self):
        if not self.nick:
            raise RuntimeError("No nick provided")
        self.switch_to_frame("//#social-sidebar-browser")
        self.find_element_by_id("nick").send_keys(self.nick)
        self.find_element_by_id("submit").click()

    def signout(self):
        self.switch_to_frame("//#social-sidebar-browser")
        self.find_element_by_css_selector('#signout button').click()

    def isSignedIn(self):
        return self.find_element_by_css_selector("strong.nick").text != ""

    def openConversation(self):
        self.implicitly_wait(4000)
        self.find_element_by_css_selector("ul.nav-list>li>a").click()

        self.switch_to_frame("//chatbox")

    def startCall(self, video):
        if video:
            self.find_element_by_css_selector(".btn-video>a").click()
        else:
            self.find_element_by_css_selector(".btn-audio>a").click()

    def acceptCall(self):
        self.find_element_by_css_selector(".btn-accept").click()


def create(nick=None):
    driver = Driver(command_executor=SELENIUM_COMMAND_EXECUTOR,
                    desired_capabilities={"browserName": "firefox"},
                    nick=nick)
    return driver
